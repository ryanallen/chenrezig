// The temple in GLSL: its shapes as distance fields and boxes, its materials (textures from concept-art/textures),
// its light (the sun through the east window, butter lamps, a baked light volume for the light bounced about the room).
// Metres, +y up, the wheel's axle on the y axis, +x east, -z north (the altar wall). Shared by bake.js and frame.js.
const COMMON = /*glsl*/`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform vec2 uRes;
uniform int uZero; // always 0: loop counts that depend on it stay loops in the compiled shader instead of being
                    // unrolled, which on Windows (Direct3D) made the compile take minutes
uniform float uTime, uPhi, uBlur, uExpo, uFov, uTex, uTone;
uniform vec3 uCam;
uniform mat3 uView;
uniform sampler2DArray uWalls, uMats, uPecha;
uniform sampler2D uStatue, uStatueD, uOut, uDrumC, uDrumH, uVol;
uniform vec4 uStatueBox; // x0, x1, y0, y1 of the statue card

#define PI 3.14159265
const vec3 RMIN=vec3(-4.,0.,-4.), RMAX=vec3(4.,4.75,4.);
// The window and the door stand where the wall textures paint their openings (measured by the build):
// uWinR = window centre z, centre y, half height, half width; uDoorR = door centre z, height, half width.
uniform vec4 uWinR; uniform vec3 uDoorR, uSun;
#define WC vec3(4.,uWinR.y,uWinR.x)
#define WH vec2(uWinR.z,uWinR.w)
#define SUN uSun
const float WX1=4.6, WBAR=4.32;
const vec3 SUNC=vec3(1.,0.82,0.6)*13.;
const vec3 LAMPC=vec3(1.,0.55,0.2);
const vec3 LAMP_ALTAR=vec3(-3.,0.75,-2.6);
const vec3 LAMP_L=vec3(-1.75,1.12,1.1), LAMP_R=vec3(1.75,1.12,1.1);
const ivec3 VN=ivec3(32,19,32); // light volume cells, 0.25 m
// The low painted table (choktse) on the visitor's side of the wheel, the pecha on its silk wrapper, the phone beside
// it and the cushion before it. Kept in step with main.js, which picks them.
const vec3 CHOK=vec3(0.85,0.,1.75);
const vec3 PECHA=CHOK+vec3(-0.08,0.,0.);
const vec3 PHONE=CHOK+vec3(0.27,0.,0.);
const float CHOK_H=0.36;

struct Surf{ vec3 a; float r; float m; vec3 e; };

float hash3(vec3 p){ p=fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float hash1(float x){ return hash3(vec3(x,x*0.37,1.3)); }
// Value noise: the lattice's random values are a 128-cube 3D texture (uNoise, made once by main.js, repeating), read
// once at the point moved by the smooth Hermite weights, so the hardware's blend of the eight corners is the smooth
// noise itself: one texture read where hashing the eight corners took eight.
uniform highp sampler3D uNoise;
float noise3(vec3 x){
  vec3 i=floor(x), f=x-i, w=f*f*(3.-2.*f);
  return textureLod(uNoise,(i+w+0.5)*(1./128.),0.).r;
}
float fbm3(vec3 x){ float v=0.,a=0.5; for(int i=0;i<4+uZero;i++){ v+=a*noise3(x); x=x*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return v; }

float sdBox(vec3 p,vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float sdRBox(vec3 p,vec3 b,float r){ return sdBox(p,b-r)-r; }
float sdBox2(vec2 p,vec2 b){ vec2 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,q.y),0.); }
float sdCyl(vec3 p,float r,float h){ vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h); return min(max(d.x,d.y),0.)+length(max(d,0.)); }
float sdCap(vec3 p,vec3 a,vec3 b,float r){ vec3 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-r; }
vec2 opU(vec2 a,float d,float m){ return d<a.x?vec2(d,m):a; }

// The wheel's profile, radius against height. Letters and petals are only in the textures.
float wheel2(vec2 q){
  float d=sdBox2(q-vec2(0.39,1.63),vec2(0.39,1.13));
  d=min(d,sdBox2(q-vec2(0.395,0.67),vec2(0.395,0.17))-0.015);
  d=min(d,sdBox2(q-vec2(0.395,2.27),vec2(0.395,0.15))-0.015);
  d=min(d,sdBox2(q-vec2(0.39,2.77),vec2(0.39,0.025))-0.01);
  d=min(d,(length((q-vec2(0.,2.78))/vec2(0.76,0.3))-1.)*0.3);
  d=min(d,length(q-vec2(0.,3.13))-0.06);
  d=min(d,max(max(q.x-0.3*(3.38-q.y),q.y-3.38),3.15-q.y)*0.9);
  return d;
}
// The 24 turned handles and their rail, turned with the wheel by phi.
float handles(vec3 p,float phi){
  float r=length(p.xz), al=atan(p.x,p.z)+phi, k=floor(al/(PI/12.)+0.5), lo=al-k*PI/12.;
  vec3 l=vec3(r*sin(lo),p.y,r*cos(lo)-0.93);
  float y=p.y;
  float rad=0.016+0.02*exp(-pow((y-0.95)/0.03,2.))+0.012*exp(-pow((y-1.06)/0.018,2.));
  float d=max(length(l.xz)-rad,max(0.9-y,y-1.12))*0.8;
  d=min(d,length(l-vec3(0.,0.895,0.))-0.03);
  d=min(d,length(vec2(r-0.93,y-1.12))-0.018);
  d=min(d,sdCap(l,vec3(0.,1.12,-0.16),vec3(0.,1.12,0.),0.012));
  return d;
}

const vec3 PIL[4]=vec3[4](vec3(-2.4,0.,-2.2),vec3(2.4,0.,-2.2),vec3(-2.4,0.,2.2),vec3(2.4,0.,2.2));
const vec3 BAN[3]=vec3[3](vec3(-1.35,4.62,-2.85),vec3(1.55,4.62,-2.85),vec3(3.0,4.62,0.6));

// A bounded group is evaluated only near its bound; farther away the bound's own distance keeps steps safe.
bool bnd(inout vec2 r,float d){ if(d>0.08){ r.x=min(r.x,d); return false; } return true; }

float banner(vec3 p,vec3 c,float len){
  vec3 q=p-c; float cr=length(q.xz), yy=-q.y;
  float f=fract(yy/0.26), R=0.17+0.07*f+0.006*sin(atan(q.x,q.z)*30.);
  float d=max(abs(cr-R)-0.008,max(yy-len,-yy))*0.7;
  d=min(d,sdCyl(q-vec3(0.,-len*0.5,0.),0.15,len*0.5));
  return d;
}

// Everything but the room's shell (walls, floor, ceiling, window recess), which room() meets exactly.
// Ids: 10 pillar, 11 brocade, 12 capital, 13 beam, 14 joist, 15 altar, 16 lamp brass, 17 bowl, 18 torma,
// 20 drum, 21 iron, 22 stone base, 26 banner, 27 canopy, 28 window bars, 29 lamp stand wood.
vec2 map(vec3 p){
  vec2 r=vec2(1e9,0.);
  for(int i=0;i<4+uZero;i++){
    vec3 s=p-PIL[i];
    if(bnd(r,sdBox(s-vec3(0.,2.03,0.),vec3(0.2,2.04,0.65)))){
      r=opU(r,sdRBox(s-vec3(0.,1.8,0.),vec3(0.14,1.8,0.14),0.012),10.);
      r=opU(r,sdRBox(s-vec3(0.,1.65,0.),vec3(0.165,0.45,0.165),0.008),11.);
      r=opU(r,sdRBox(s-vec3(0.,3.83,0.),vec3(0.12,0.22,0.6),0.01),12.);
    }
  }
  // the beams on the pillars, the cross beam over the wheel on iron straps, its bearing block, the joists
  if(bnd(r,3.45-p.y)){
    float bx=abs(p.x)-2.4;
    r=opU(r,sdRBox(vec3(bx,p.y-4.2,p.z),vec3(0.15,0.15,4.),0.01),13.);
    r=opU(r,sdRBox(p-vec3(0.,3.81,0.),vec3(2.55,0.15,0.15),0.01),13.);
    r=opU(r,sdBox(vec3(abs(p.x)-2.05,p.y-4.0,p.z),vec3(0.035,0.32,0.17)),21.);
    r=opU(r,sdRBox(p-vec3(0.,3.58,0.),vec3(0.11,0.08,0.11),0.01),21.);
    float jz=p.z-0.6*floor(p.z/0.6+0.5);
    r=opU(r,sdRBox(vec3(p.x,p.y-4.67,jz),vec3(4.,0.08,0.07),0.01),14.);
  }
  // the wheel's stone base and axle (the drum itself is in mapWheel)
  float pr=length(p.xz);
  if(bnd(r,sdCyl(p-vec3(0.,0.15,0.),0.9,0.16))){
    r=opU(r,min(sdCyl(p-vec3(0.,0.05,0.),0.86,0.05),sdCyl(p-vec3(0.,0.17,0.),0.75,0.08))-0.01,22.);
  }
  // the silk canopy over the wheel
  if(bnd(r,sdCyl(p-vec3(0.,4.4,0.),1.4,0.36))){
    float f=fract((4.75-p.y)/0.16), R=1.15+0.08*f+0.012*sin(atan(p.x,p.z)*70.);
    r=opU(r,max(abs(pr-R)-0.012,max(p.y-4.62,4.1-p.y))*0.6,27.);
  }
  for(int i=0;i<3+uZero;i++){
    vec3 c=BAN[i];
    if(bnd(r,sdCyl(p-vec3(c.x,c.y-0.75,c.z),0.3,0.78))) r=opU(r,banner(p,c,1.45),26.);
  }
  // the altar, its lamp step, the low offering table before it, lamps, water bowls and tormas
  if(bnd(r,sdBox(p-vec3(-3.,0.6,-3.22),vec3(1.,0.62,0.83)))){
    r=opU(r,sdRBox(p-vec3(-3.,0.475,-3.525),vec3(0.95,0.475,0.475),0.01),15.);
    r=opU(r,sdRBox(p-vec3(-3.,0.275,-2.9),vec3(0.95,0.275,0.15),0.01),15.);
    r=opU(r,sdRBox(p-vec3(-3.,0.2,-2.575),vec3(0.9,0.2,0.155),0.01),15.);
    float li=clamp(floor((p.x+3.8)/0.2+0.5),0.,8.);
    vec3 lq=p-vec3(-3.8+li*0.2,0.55,-2.9);
    float ld=sdCyl(lq-vec3(0.,0.006,0.),0.032,0.006);
    ld=min(ld,sdCap(lq,vec3(0.),vec3(0.,0.07,0.),0.009));
    ld=min(ld,sdCyl(lq-vec3(0.,0.088,0.),0.038,0.017)-0.003);
    r=opU(r,ld,16.);
    float bi=clamp(floor((p.x+3.6)/0.2+0.5),0.,6.);
    if(abs(p.x+3.)>0.5||bi<0.5||bi>5.5) r=opU(r,sdCyl(p-vec3(-3.6+bi*0.2,0.985,-3.12),0.05,0.035)-0.004,17.);
    for(int k=0;k<2+uZero;k++){
      vec3 tq=p-vec3(k==0?-3.82:-2.18,0.95,-3.3);
      float h=clamp(tq.y/0.36,0.,1.), R=0.07*(1.-h*0.85)+0.006*sin(h*37.)*(1.-h);
      r=opU(r,max(length(tq.xz)-R,max(-tq.y,tq.y-0.36))*0.8,18.);
    }
  }
  // two standing butter lamps on the visitor's side
  for(int k=0;k<2+uZero;k++){
    vec3 c=k==0?LAMP_L:LAMP_R;
    vec3 q=p-vec3(c.x,0.,c.z);
    if(bnd(r,sdCyl(q-vec3(0.,0.56,0.),0.2,0.58))){
      float d=sdCyl(q-vec3(0.,0.03,0.),0.17,0.03);
      d=min(d,sdCap(q,vec3(0.,0.05,0.),vec3(0.,0.98,0.),0.03));
      r=opU(r,d,29.);
      float b=sdCyl(q-vec3(0.,1.0,0.),0.09,0.025)-0.01;
      b=min(b,sdCyl(q-vec3(0.,1.06,0.),0.075,0.035)-0.006);
      r=opU(r,b,16.);
    }
  }
  // the choktse (top 30, body 31), the pecha's cover boards 32 and leaves 33 on its yellow silk 34, the strap 38,
  // the cushion 35, the phone 36 with its screen 37
  if(bnd(r,sdBox(p-vec3(CHOK.x,0.25,CHOK.z+0.25),vec3(0.45,0.26,0.62)))){
    vec3 c=p-CHOK;
    r=opU(r,sdRBox(c-vec3(0.,CHOK_H-0.016,0.),vec3(0.38,0.016,0.23),0.006),30.);
    r=opU(r,sdRBox(c-vec3(0.,(CHOK_H-0.032)*0.5,-0.01),vec3(0.36,(CHOK_H-0.032)*0.5,0.21),0.004),31.);
    vec3 b=p-vec3(PECHA.x,CHOK_H,PECHA.z);
    r=opU(r,sdBox(b-vec3(0.,0.002,0.),vec3(0.31,0.002,0.1)),34.);
    float bd=min(sdRBox(b-vec3(0.,0.015,0.),vec3(0.27,0.011,0.058),0.004),sdRBox(b-vec3(0.,0.075,0.),vec3(0.27,0.011,0.058),0.004));
    r=opU(r,bd,32.);
    r=opU(r,sdRBox(b-vec3(0.,0.045,0.),vec3(0.262,0.02,0.05),0.002),33.);
    r=opU(r,max(sdBox(b-vec3(0.08,0.045,0.),vec3(0.016,0.0425,0.0605)),-sdBox(b-vec3(0.08,0.045,0.),vec3(0.03,0.04,0.058))),38.);
    vec3 f=p-vec3(PHONE.x,CHOK_H,PHONE.z);
    r=opU(r,sdRBox(f-vec3(0.,0.0045,0.),vec3(0.037,0.0045,0.078),0.004),36.);
    r=opU(r,sdRBox(c-vec3(0.,0.075,0.55),vec3(0.3,0.075,0.3),0.06),35.);
  }
  // the window's wooden frame and lattice, set in its recess: a frame round the opening, two mullions, three
  // transoms, and a lattice of thin glazing bars between
  vec3 wq=p-vec3(WBAR,WC.y,WC.z);
  if(bnd(r,sdBox(wq,vec3(0.06,WH.x+0.02,WH.y+0.02)))){
    vec2 a=wq.zy;
    float frame=-sdBox2(a,WH-0.07);
    float mull=abs(abs(a.x)-WH.y/3.)-0.025;
    float tran=min(abs(a.y)-0.025,abs(abs(a.y)-WH.x*0.55)-0.025);
    vec2 g=mod(a+0.5,vec2(0.155,0.155))-0.0775;
    float latt=min(abs(g.x),abs(g.y))-0.007;
    float d2=min(min(frame,mull),min(tran,latt));
    float d=max(abs(wq.x)-(latt==d2?0.012:0.045),max(d2,sdBox2(a,WH)));
    r=opU(r,d,28.);
  }
  return r;
}
// The wheel alone: drum 20, axle 21.
vec2 mapWheel(vec3 p){
  vec2 r=vec2(wheel2(vec2(length(p.xz),p.y)),20.);
  return opU(r,sdCyl(p-vec3(0.,1.93,0.),0.06,1.63),21.);
}
vec2 mapAll(vec3 p){ vec2 a=map(p), b=mapWheel(p); return a.x<b.x?a:b; }

vec3 nrmAll(vec3 p){
  vec3 n=vec3(0.);
  for(int k=0;k<4+uZero;k++){
    vec3 e=0.5773*(2.*vec3(float(((k+3)>>1)&1),float((k>>1)&1),float(k&1))-1.);
    n+=e*mapAll(p+e*0.0007).x;
  }
  return normalize(n);
}

// ---- the room's shell, met exactly: walls 2 north, 3 east, 4 south, 5 west, floor 1, ceiling 6, recess 7 ----
struct Hit{ float t; vec3 n; float id; bool sky; };
vec4 boxExit(vec3 ro,vec3 rd,vec3 bmin,vec3 bmax){
  vec3 inv=1./rd, tf=max((bmin-ro)*inv,(bmax-ro)*inv);
  float t=min(tf.x,min(tf.y,tf.z));
  vec3 n=vec3(0.,0.,-sign(rd.z));
  if(t==tf.x) n=vec3(-sign(rd.x),0.,0.); else if(t==tf.y) n=vec3(0.,-sign(rd.y),0.);
  return vec4(max(t,0.),n);
}
float shellId(vec3 n){
  if(n.y>0.5) return 1.; if(n.y<-0.5) return 6.;
  if(n.z>0.5) return 2.; if(n.x<-0.5) return 3.; if(n.z<-0.5) return 4.; return 5.;
}
bool inWin(vec3 q){ return abs(q.y-WC.y)<WH.x&&abs(q.z-WC.z)<WH.y; }
// The framed thangkas stand off the walls as boxes FRAME_D deep (frames.js, made by walls.py): their faces and sides
// show the wall texture there, which holds the frame and the painting, so they read as wall id 2 to 5.
const float FRAME_D=0.04;
const int NFR=${FRAMES.length};
const vec4 FRU[NFR]=vec4[NFR](${FRAMES.map(([, u0, u1, y0, y1]) => `vec4(${u0},${u1},${y0},${y1})`).join(',')});
const int FRW[NFR]=int[NFR](${FRAMES.map(([w]) => w).join(',')});
void frameBox(int k,out vec3 bmin,out vec3 bmax){
  vec4 f=FRU[k]; int w=FRW[k];
  if(w==0){ bmin=vec3(f.x-4.,f.z,-4.); bmax=vec3(f.y-4.,f.w,-4.+FRAME_D); }
  else if(w==1){ bmin=vec3(4.-FRAME_D,f.z,f.x-4.); bmax=vec3(4.,f.w,f.y-4.); }
  else if(w==2){ bmin=vec3(4.-f.y,f.z,4.-FRAME_D); bmax=vec3(4.-f.x,f.w,4.); }
  else { bmin=vec3(-4.,f.z,4.-f.y); bmax=vec3(-4.+FRAME_D,f.w,4.-f.x); }
}
// the nearest frame box along a ray before tmax: its distance, normal and wall id in h
void frames(vec3 ro,vec3 rd,inout Hit h){
  vec3 inv=1./rd;
  for(int k=0;k<NFR+uZero;k++){
    vec3 bmin, bmax; frameBox(k,bmin,bmax);
    vec3 t0=(bmin-ro)*inv, t1=(bmax-ro)*inv, lo=min(t0,t1), hi=max(t0,t1);
    float a=max(max(lo.x,lo.y),lo.z), b=min(min(hi.x,hi.y),hi.z);
    if(a<b&&a>0.&&a<h.t){
      vec3 n=a==lo.x?vec3(-sign(rd.x),0.,0.):a==lo.y?vec3(0.,-sign(rd.y),0.):vec3(0.,0.,-sign(rd.z));
      h=Hit(a,n,float(FRW[k]+2),false);
    }
  }
}
Hit room(vec3 ro,vec3 rd){
  if(ro.x>4.){
    vec4 e=boxExit(ro,rd,vec3(4.,WC.y-WH.x,WC.z-WH.y),vec3(WX1,WC.y+WH.x,WC.z+WH.y));
    if(e.y<-0.5) return Hit(e.x,vec3(0.),0.,true);
    if(e.y>0.5){ ro=ro+rd*e.x; vec4 f=boxExit(ro,rd,RMIN,RMAX); return Hit(e.x+f.x,f.yzw,shellId(f.yzw),false); }
    return Hit(e.x,e.yzw,7.,false);
  }
  vec4 e=boxExit(ro,rd,RMIN,RMAX); vec3 p=ro+rd*e.x;
  if(e.y<-0.5&&inWin(p)){
    vec4 f=boxExit(p,rd,vec3(4.,WC.y-WH.x,WC.z-WH.y),vec3(WX1,WC.y+WH.x,WC.z+WH.y));
    if(f.y<-0.5) return Hit(e.x+f.x,vec3(0.),0.,true);
    return Hit(e.x+f.x,f.yzw,7.,false);
  }
  Hit h=Hit(e.x,e.yzw,shellId(e.yzw),false);
#ifndef NO_FRAMES
  frames(ro,rd,h);
#endif
  return h;
}
// The nearest surface along a ray, the room's objects marched up to the shell.
Hit trace(vec3 ro,vec3 rd,bool wheel){
  Hit h=room(ro,rd);
  float t=0.;
  for(int i=0;i<140+uZero;i++){
    if(t>h.t) break;
    vec3 p=ro+rd*t; vec2 d=wheel?mapAll(p):map(p);
    if(d.x<0.0005*(1.+t)) return Hit(t,nrmAll(p),d.y,false);
    t+=d.x*0.9;
  }
  return h;
}
// Soft shadow toward a light, objects only (the shell is handled by winPass for the sun).
float shadow(vec3 ro,vec3 rd,float tmax,bool wheel){
  float res=1., t=0.02;
  for(int i=0;i<64+uZero;i++){
    if(t>tmax) break;
    float h=wheel?mapAll(ro+rd*t).x:map(ro+rd*t).x;
    res=min(res,12.*h/t);
    if(res<0.02) return 0.;
    t+=clamp(h,0.02,0.4);
  }
  return clamp(res,0.,1.);
}
// Does a ray from p in direction d leave through the window opening, between its bars?
bool winPass(vec3 p,vec3 d){
  if(d.x<=0.) return false;
  for(int k=0;k<2+uZero;k++){
    float X=k==0?4.:WX1, t=(X-p.x)/d.x; if(t<0.) continue;
    vec3 q=p+d*t; vec2 a=vec2(q.y-WC.y,q.z-WC.z);
    if(abs(a.x)>WH.x||abs(a.y)>WH.y) return false;
  }
  return true;
}

// ---- materials ----
float lum(vec3 c){ return dot(c,vec3(0.3,0.5,0.2)); }
vec3 tex(int layer,vec2 uv){ vec3 c=texture(uMats,vec3(uv,float(layer))).rgb; return c*c; }
vec3 wall(int w,vec2 uv){ vec3 c=texture(uWalls,vec3(uv,float(w))).rgb; return c*c; }
vec3 pk(int layer,vec2 uv){ vec3 c=texture(uPecha,vec3(uv,float(layer))).rgb; return c*c; }

Surf surface(vec3 p,vec3 n,float id){
  int i=int(id+0.5);
  Surf s=Surf(vec3(0.5),0.8,0.,vec3(0.));
  if(i==1){ s.a=tex(0,p.xz*vec2(0.5,0.5)); s.r=0.55; float rr=length(p.xz); s.r-=0.25*exp(-pow((rr-1.5)/0.35,2.)); }
  else if(i>=2&&i<=5){
    float u=i==2?(p.x+4.)/8.:i==3?(p.z+4.)/8.:i==4?(4.-p.x)/8.:(4.-p.z)/8.;
    vec2 uv=vec2(u,1.-p.y/4.75);
    s.a=wall(i-2,uv); s.r=0.85;
    if(i==5&&abs(p.z-uDoorR.x)<uDoorR.z&&p.y<uDoorR.y){ s.a=tex(7,vec2((p.z-uDoorR.x)/(2.*uDoorR.z)+0.5,1.-p.y/uDoorR.y)); s.r=0.6; }
  }
  else if(i==6){ s.a=tex(5,p.xz*0.5); s.r=0.9; }
  else if(i==7){ s.a=tex(8,(abs(n.x)>0.5?p.zy:abs(n.y)>0.5?p.xz:p.xy)*1.)*0.75; s.r=0.9; }
  else if(i==10){ s.a=tex(1,vec2((abs(n.x)>0.5?p.z:p.x)/0.3,p.y/2.)); s.r=0.6; }
  else if(i==11){ s.a=tex(2,vec2((abs(n.x)>0.5?p.z:p.x)/0.33+(abs(n.x)>0.5?0.25:0.),(2.1-p.y)/0.9)); s.r=0.5; }
  else if(i==12){
    vec2 uv=abs(n.x)>0.5?vec2(fract((p.z+2.2)/1.2+0.5),(4.05-p.y)/0.45):vec2(fract(p.x/0.24),(4.05-p.y)/0.45);
    s.a=tex(3,uv); s.a=max(s.a,vec3(0.05,0.02,0.01)); s.r=0.6;
  }
  else if(i==13||i==14){ vec2 uv=abs(n.x)>0.5?vec2(p.z/4.,(4.35-p.y)/0.3):vec2(p.x/4.,(p.y)/0.3); if(abs(n.y)>0.5) uv=vec2(p.x/4.,p.z/0.3); s.a=tex(4,uv)*(i==14?0.6:1.); s.r=0.7; }
  else if(i==15){
    if(n.z>0.5&&p.z>-3.1&&p.z<-3.0){ s.a=tex(6,vec2((p.x+3.95)/1.9,(0.95-p.y)/0.95)); }
    else if(n.z>0.5){ s.a=tex(6,vec2((p.x+3.95)/1.9,(0.55-p.y)/0.95+0.5))*0.8; }
    else s.a=vec3(0.2,0.04,0.025)*(0.7+0.5*noise3(p*15.));
    s.r=0.5;
  }
  else if(i==16){ s=Surf(vec3(0.8,0.58,0.26),0.28,1.,vec3(0.)); }
  else if(i==17){ s=Surf(vec3(0.82,0.82,0.8),0.2,1.,vec3(0.)); }
  else if(i==18){ vec3 tq=p-vec3(p.x>-3.?-2.18:-3.82,0.95,-3.3); s.a=fract(tq.y/0.085)<0.4?vec3(0.6,0.05,0.03):vec3(0.78,0.68,0.6); s.r=0.7; }
  else if(i==21){ s=Surf(vec3(0.09,0.085,0.08),0.45,0.8,vec3(0.)); }
  else if(i==22){ s.a=vec3(0.36,0.33,0.29)*(0.6+0.6*fbm3(p*vec3(9.,14.,9.))); s.r=0.85; }
  else if(i==25){ s.a=vec3(0.8,0.76,0.66)*(0.9+0.15*noise3(p*40.)); s.r=0.7; }
  else if(i==26){
    int b=0; float bd=9.; for(int k=0;k<3+uZero;k++){ float dd=length(p.xz-BAN[k].xz); if(dd<bd){ bd=dd; b=k; } }
    vec3 q=p-BAN[b];
    s.a=tex(9,vec2(atan(q.x,q.z)/(2.*PI)*1.,-q.y/1.5)); s.r=0.45;
  }
  else if(i==27){ s.a=tex(9,vec2(atan(p.x,p.z)/(2.*PI)*4.,(4.75-p.y)/1.5)); s.r=0.45; }
  else if(i==28){ s.a=tex(1,p.zy*2.)*vec3(0.55,0.45,0.4); s.r=0.55; }
  else if(i==29){ s.a=tex(1,vec2(atan(p.x,p.z),p.y))*0.6; s.r=0.5; }
  else if(i>=30&&i<=38){
    vec3 c=p-CHOK, b=p-vec3(PECHA.x,CHOK_H,PECHA.z);
    // uPecha layers: 0 choktse top, 1 choktse front, 2 cover board, 3 silk, 4 cushion, 5 leaf, 6 phone screen
    if(i==30){ s.a=n.y>0.5?pk(0,vec2(c.x/0.76+0.5,c.z/0.46+0.5)):vec3(0.25,0.03,0.02); s.r=0.45; }
    else if(i==31){ s.a=n.z>0.5?pk(1,vec2(c.x/0.72+0.5,(CHOK_H-0.032-c.y)/(CHOK_H-0.032))):pk(1,vec2(c.z/0.42+0.5,(CHOK_H-0.032-c.y)/(CHOK_H-0.032)))*0.6; s.r=0.5; }
    else if(i==32){ s.a=n.y>0.5?pk(2,vec2(b.x/0.54+0.5,b.z/0.116+0.5)):pk(2,vec2(b.x/0.54+0.5,0.5))*0.45; s.r=0.5; }
    else if(i==33){ float st=fract(b.y*900.); s.a=pk(5,vec2(b.x/0.52+0.5,0.5+b.y*3.))*(0.78+0.22*smoothstep(0.,0.6,st)); s.r=0.9; }
    else if(i==34){ s.a=pk(3,b.xz*2.5); s.r=0.4; }
    else if(i==35){ s.a=pk(4,(abs(n.y)>0.5?c.xz:abs(n.x)>0.5?c.zy:c.xy)*2.); s.r=0.55; }
    else if(i==38){ s.a=pk(3,b.xy*8.)*vec3(0.75,0.4,0.2); s.r=0.5; }
    else {
      vec3 f=p-vec3(PHONE.x,CHOK_H,PHONE.z);
      s=Surf(vec3(0.02),0.25,0.3,vec3(0.));
      if(n.y>0.5&&abs(f.x)<0.033&&abs(f.z)<0.072){
        // the screen, the video's thumbnail lit faintly, held the long way like a phone playing a film
        vec3 t=pk(6,vec2(0.5-f.z/0.144,0.5+f.x/0.066));
        s=Surf(vec3(0.01),0.08,0.,t*0.35);
      }
    }
  }
  return s;
}

// ---- light ----
vec3 brdf(vec3 n,vec3 v,vec3 l,Surf m){
  vec3 h=normalize(v+l); float nl=max(dot(n,l),1e-4), nv=max(dot(n,v),1e-4), nh=max(dot(n,h),0.), vh=max(dot(v,h),0.);
  float a=max(m.r*m.r,0.002), a2=a*a, dd=nh*nh*(a2-1.)+1., D=a2/(PI*dd*dd);
  float k=a*0.5, G=nl*nv/((nl*(1.-k)+k)*(nv*(1.-k)+k));
  vec3 F0=mix(vec3(0.04),m.a,m.m), F=F0+(1.-F0)*pow(1.-vh,5.);
  return (1.-m.m)*(1.-F)*m.a/PI+D*F*G/(4.*nl*nv);
}
// The light from the sun and the lamps falling on p, with soft shadows.
vec3 direct(vec3 p,vec3 n,vec3 v,Surf m,bool wheel,bool spec){
  vec3 L=vec3(0.); vec3 o=p+n*0.004;
  if(dot(n,SUN)>0.&&winPass(p,SUN)){
    float sh=shadow(o,SUN,(4.-p.x)/SUN.x,wheel);
    if(sh>0.) L+=SUNC*sh*(spec?brdf(n,v,SUN,m):m.a/PI*(1.-m.m))*dot(n,SUN);
  }
  for(int k=0;k<3+uZero;k++){
    vec3 lp=k==0?LAMP_ALTAR:k==1?LAMP_L+vec3(0.,0.05,0.):LAMP_R+vec3(0.,0.05,0.);
    float I=k==0?3.2:0.9;
    vec3 l=lp-p; float d2=dot(l,l), dl=sqrt(d2); l/=dl;
    float nl=dot(n,l); if(nl<=0.) continue;
    // a lamp that adds little light here is not worth a shadow ray: its light is added unshadowed
    float E=I/max(d2,0.04)*nl, sh=E>0.05?shadow(o,l,dl-0.08,wheel):1.;
    L+=LAMPC*I/max(d2,0.04)*sh*(spec?brdf(n,v,l,m):m.a/PI*(1.-m.m))*nl;
  }
  return L;
}
// The baked light volume: the light arriving at p from each of six directions, blended by the normal.
vec3 volFetch(ivec3 c,int k){
  c=clamp(c,ivec3(0),VN-1);
  return texelFetch(uVol,ivec2(k*VN.x+c.x,c.z*VN.y+c.y),0).rgb;
}
vec3 ambient(vec3 p,vec3 n){
  vec3 g=(p-RMIN)/0.25-0.5; ivec3 c0=ivec3(floor(g)); vec3 f=g-floor(g);
  vec3 n2=n*n; ivec3 sgn=ivec3(n.x<0.?1:0,n.y<0.?1:0,n.z<0.?1:0);
  vec3 acc=vec3(0.); float wsum=0.;
  for(int i=0;i<8+uZero;i++){
    ivec3 o=ivec3(i&1,(i>>1)&1,(i>>2)&1);
    vec3 w3=mix(1.-f,f,vec3(o)); float w=w3.x*w3.y*w3.z;
    ivec3 c=c0+o;
    vec4 vx=texelFetch(uVol,ivec2((0+sgn.x)*VN.x+clamp(c.x,0,VN.x-1),clamp(c.z,0,VN.z-1)*VN.y+clamp(c.y,0,VN.y-1)),0);
    vec4 vy=texelFetch(uVol,ivec2((2+sgn.y)*VN.x+clamp(c.x,0,VN.x-1),clamp(c.z,0,VN.z-1)*VN.y+clamp(c.y,0,VN.y-1)),0);
    vec4 vz=texelFetch(uVol,ivec2((4+sgn.z)*VN.x+clamp(c.x,0,VN.x-1),clamp(c.z,0,VN.z-1)*VN.y+clamp(c.y,0,VN.y-1)),0);
    float valid=vx.a; w*=valid;
    acc+=w*(n2.x*vx.rgb+n2.y*vy.rgb+n2.z*vz.rgb); wsum+=w;
  }
  return acc/max(wsum,1e-4);
}

// The view out of the window: a photograph far away, met where the ray reaches x = 60.
// The window sits high in the wall, so it is always seen from below: the painting is laid so that those upward views
// meet the snow peaks, the stupa and the flags (its ridge line about 20 degrees up), not its empty sky. At picture
// brightness here; the bake takes it brighter, as the daylight it throws into the room.
vec3 outside(vec3 rd){
  vec2 q=vec2(rd.z,rd.y)/max(rd.x,0.05);
  // by angle, the steep ones compressed, so that even from right under the window the peaks fill it
  vec2 uv=vec2(0.5+atan(q.x)*0.45,0.64-atan(q.y)*0.55);
  vec3 c=texture(uOut,uv).rgb; return c*c*0.7;
}
`;
