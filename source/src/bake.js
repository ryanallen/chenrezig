// The light volume, gathered at load. Each texel is one cell of a 32 x 19 x 32 grid (0.25 m) and one of six
// directions (+x -x +y -y +z -z): the light arriving at a surface there facing that way. Each frame adds one ray
// a texel; a ray that meets a surface takes its direct light and, through the volume so far, the light bounced onto it,
// so the bounces build up over the frames. Cells inside a solid add nothing and stay marked empty (alpha 0).
const VS = /*glsl*/`#version 300 es
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.); }`;

const BAKE = COMMON + /*glsl*/`
uniform float uFrame;
out vec4 o;
uint rs;
float rnd(){ rs=rs*747796405u+2891336453u; uint w=((rs>>((rs>>28u)+4u))^rs)*277803737u; w=(w>>22u)^w; return float(w)*2.3283064e-10; }
vec3 cosDir(vec3 n){
  float r1=rnd(), r2=rnd(), ph=6.283185*r1, sr=sqrt(r2);
  vec3 t=normalize(abs(n.y)<0.9?cross(n,vec3(0.,1.,0.)):cross(n,vec3(1.,0.,0.))), b=cross(n,t);
  return normalize(t*cos(ph)*sr+b*sin(ph)*sr+n*sqrt(1.-r2));
}
void main(){
  ivec2 f=ivec2(gl_FragCoord.xy);
  int k=f.x/VN.x, ix=f.x%VN.x, iz=f.y/VN.y, iy=f.y%VN.y;
  vec3 p=RMIN+(vec3(ix,iy,iz)+0.5)*0.25;
  if(mapAll(p).x<0.03){ o=vec4(0.); return; }
  rs=uint(f.x*1973+f.y*9277)+uint(uFrame)*26699u; rs|=1u; rnd(); rnd();
  vec3 d=k==0?vec3(1,0,0):k==1?vec3(-1,0,0):k==2?vec3(0,1,0):k==3?vec3(0,-1,0):k==4?vec3(0,0,1):vec3(0,0,-1);
  vec3 rd=cosDir(d);
  Hit h=trace(p,rd,true);
  vec3 L;
  if(h.sky) L=outside(rd)*2.9; // the daylight from the view, as bright as it gave the room before
  else {
    vec3 q=p+rd*h.t; Surf s=surface(q,h.n,h.id);
    L=direct(q,h.n,-rd,s,true,false)+s.a*(1.-s.m*0.7)*ambient(q+h.n*0.12,h.n);
  }
  o=vec4(min(L,vec3(30.)),1.);
}`;

// The volume as the frame and the next bake read it: the running average, alpha 1 where the cell holds light.
const NORM = /*glsl*/`#version 300 es
precision highp float;
uniform sampler2D uAcc;
out vec4 o;
void main(){ vec4 a=texelFetch(uAcc,ivec2(gl_FragCoord.xy),0); o=a.a>0.?vec4(a.rgb/a.a,1.):vec4(0.); }`;
