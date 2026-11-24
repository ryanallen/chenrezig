// The frame: a ray from the eye into the temple each pixel, shaded with the sun, the lamps and the light volume;
// the drum shaded with its turning texture and motion blur; the handles marched over a few moments of the turn;
// the sunbeam through incense smoke; the butter-lamp flames; tone mapping.
const FRAME = COMMON + /*glsl*/`
out vec4 o;

vec3 camRay(vec2 fc){ vec2 q=(2.*fc-uRes)/uRes.y*uFov; return normalize(uView*vec3(q,1.)); }

// The statue: a painted card with depth standing on the altar, met by marching its height field (uStatueD, smooth
// half floats, so the surface shows no steps).
const float SZ0=-3.52, SDEP=0.32;
bool statueHit(vec3 ro,vec3 rd,out float th,out vec3 n,out vec3 col){
  vec3 bmin=vec3(uStatueBox.x,uStatueBox.z,SZ0), bmax=vec3(uStatueBox.y,uStatueBox.w,SZ0+SDEP);
  vec3 inv=1./rd, t0=(bmin-ro)*inv, t1=(bmax-ro)*inv;
  vec3 lo=min(t0,t1), hi=max(t0,t1);
  float a=max(max(lo.x,lo.y),max(lo.z,0.)), b=min(min(hi.x,hi.y),hi.z);
  if(a>=b) return false;
  vec2 sz=vec2(uStatueBox.y-uStatueBox.x,uStatueBox.w-uStatueBox.z);
  float prev=a;
  for(int i=0;i<=48+uZero;i++){
    float t=mix(a,b,float(i)/48.); vec3 q=ro+rd*t;
    vec2 uv=vec2((q.x-uStatueBox.x)/sz.x,1.-(q.y-uStatueBox.z)/sz.y);
    float d=textureLod(uStatueD,uv,0.).r;
    if(d>0.03&&q.z<=SZ0+SDEP*d){
      for(int j=0;j<5+uZero;j++){ float tm=0.5*(prev+t); vec3 qm=ro+rd*tm; vec2 um=vec2((qm.x-uStatueBox.x)/sz.x,1.-(qm.y-uStatueBox.z)/sz.y); float dm=textureLod(uStatueD,um,0.).r; if(dm>0.03&&qm.z<=SZ0+SDEP*dm) t=tm; else prev=tm; }
      th=t; q=ro+rd*t; uv=vec2((q.x-uStatueBox.x)/sz.x,1.-(q.y-uStatueBox.z)/sz.y);
      vec2 e=vec2(1.5)/vec2(textureSize(uStatueD,0));
      float dx=textureLod(uStatueD,uv+vec2(e.x,0.),0.).r-textureLod(uStatueD,uv-vec2(e.x,0.),0.).r;
      float dy=textureLod(uStatueD,uv+vec2(0.,e.y),0.).r-textureLod(uStatueD,uv-vec2(0.,e.y),0.).r;
      n=normalize(vec3(-dx*SDEP/(2.*e.x*sz.x),dy*SDEP/(2.*e.y*sz.y),1.));
      vec3 c=textureLod(uStatue,uv,0.).rgb; col=c*c; return true;
    }
    prev=t;
  }
  return false;
}

// The offerings before the statue: Codex's paintings of them, one to a cell of an atlas four cells across and six down, as cards that turn
// about the vertical to face the visitor, in relief: each one's depth map (uOfferD) sets how far toward the visitor
// each point stands, up to a third of its size, and shades it. Each is (x, base y, z, size); the paintings stand 4%
// above their cell's foot.
// Their places are in layout.js.
uniform sampler2D uOffer, uOfferD;
uniform sampler2D uMA, uMN; uniform float uModels; // the model buffers, once the models are in
const vec4 OFF[22]=vec4[22](${OFFERINGS.map(([, x, y, z, s]) => `vec4(${x},${y},${z},${s})`).join(",")});  // from layout.js
bool offerHit(vec3 ro,vec3 rd,float tmax,out float th,out vec3 n,out vec3 col){
  vec3 inv=1./rd, t0=(vec3(-3.95,-0.05,-3.95)-ro)*inv, t1=(vec3(-0.9,1.35,-2.3)-ro)*inv;
  vec3 lo=min(t0,t1), hi=max(t0,t1);
  if(max(max(lo.x,lo.y),max(lo.z,0.))>=min(min(hi.x,hi.y),min(hi.z,tmax))) return false;
  bool hit=false; th=tmax;
  for(int i=0;i<22+uZero;i++){
    vec4 o=OFF[i]; vec3 c=o.xyz;
    vec2 f=normalize(ro.xz-c.xz); vec3 N=vec3(f.x,0.,f.y);
    float dn=dot(rd,N); if(dn>-1e-4) continue;
    float t=dot(c-ro,N)/dn; if(t<=0.||t>=th) continue;
    vec3 q=ro+rd*t-c;
    vec2 uv=vec2(dot(q,vec3(N.z,0.,-N.x))/o.w+0.5,1.-q.y/o.w);
    if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) continue;
    vec2 at=(vec2(float(i%4),float(i/4))+clamp(uv,0.004,0.996))*vec2(0.25,1./6.);
    float lod=max(0.,log2(t*2.*uFov/uRes.y*512./o.w));
    vec4 s=textureLod(uOffer,at,lod);
    if(s.a<0.5) continue;
    float thick=o.w*0.33, D=textureLod(uOfferD,at,lod).r;
    vec2 e=vec2(1.5)/vec2(textureSize(uOfferD,0));
    float gx=(textureLod(uOfferD,at+vec2(e.x,0.),lod).r-textureLod(uOfferD,at-vec2(e.x,0.),lod).r)/(2.*e.x*4.)*thick/o.w;
    float gv=(textureLod(uOfferD,at+vec2(0.,e.y),lod).r-textureLod(uOfferD,at-vec2(0.,e.y),lod).r)/(2.*e.y*6.)*thick/o.w;
    hit=true; th=t-D*thick/max(-dn,0.25);
    n=normalize(N-vec3(N.z,0.,-N.x)*gx+vec3(0.,gv,0.)); col=s.rgb*s.rgb*0.6;
  }
  return hit;
}
// The drum: its texture turned by phi, blurred over the turn of this frame, its relief from the height map.
vec3 drumShade(vec3 P,vec3 rd,float t){
  float r=length(P.xz), th=atan(P.x,P.z);
  vec2 q=vec2(r,P.y); float e=0.0015;
  float gx=wheel2(q+vec2(e,0.))-wheel2(q-vec2(e,0.)), gy=wheel2(q+vec2(0.,e))-wheel2(q-vec2(0.,e));
  vec3 rad=vec3(sin(th),0.,cos(th)), tg=vec3(cos(th),0.,-sin(th));
  vec3 nb=normalize(gx*rad+vec3(0.,gy,0.));
  vec3 V=-rd;
  // the light reaching this spot: visibility of each light found once, then used for every blur sample
  vec3 o=P+nb*0.004;
  float sunV=(winPass(P,SUN)?shadow(o,SUN,(4.-P.x)/SUN.x,false):0.);
  vec3 lp[3]; float li[3], lv[3];
  for(int k=0;k<3+uZero;k++){
    lp[k]=k==0?LAMP_ALTAR:k==1?LAMP_L+vec3(0.,0.05,0.):LAMP_R+vec3(0.,0.05,0.);
    vec3 l=lp[k]-P; float dl=length(l); li[k]=(k==0?3.2:0.9)/max(dl*dl,0.04);
    lv[k]=dot(nb,l)>0.?(li[k]*dot(nb,l/dl)>0.05?shadow(o,l/dl,dl-0.08,false):1.):0.;
  }
  vec3 E=ambient(P+nb*0.06,nb), G=ambient(P+nb*0.06,reflect(rd,nb));
  float fp=t*2.*uFov/uRes.y, rr=max(r,0.05);
  float lod=clamp(log2(max(fp/(6.283*rr/4096.),1.))-0.6,0.,6.); // a little sharper than the footprint asks: the letters are the point
  float du=exp2(lod)/4096., dv=exp2(lod)/2048.;
  float arc=uBlur*rr/fp;
  int ns=int(clamp(ceil(arc/2.),1.,32.));
  float v=(3.6-P.y)/3.15;
  vec3 sum=vec3(0.);
  for(int s=0;s<32+uZero;s++){
    if(s>=ns) break;
    float ph=uPhi-uBlur*(float(s)+0.5)/float(ns);
    float uu=th/6.283185+ph/6.283185;
    vec2 uv=vec2(uu,v);
    vec3 c=textureLod(uDrumC,uv,lod).rgb, alb=c*c;
    vec4 hm=textureLod(uDrumH,uv,lod);
    float hu=textureLod(uDrumH,uv+vec2(du,0.),lod).r-textureLod(uDrumH,uv-vec2(du,0.),lod).r;
    float hv=textureLod(uDrumH,uv+vec2(0.,dv),lod).r-textureLod(uDrumH,uv-vec2(0.,dv),lod).r;
    float su=hu*0.006/(2.*du*6.283*rr), sv=-hv*0.006/(2.*dv*3.15);
    vec3 nr=normalize(nb-su*tg-sv*vec3(0.,1.,0.));
    float mt=hm.g;
    vec3 hp=vec3(uu*6.283*0.78*70.,v*3.15*70.,0.);
    vec2 hn=vec2(noise3(hp)-0.5,noise3(hp+vec3(7.1,3.3,1.))-0.5)*0.35*mt*exp2(-lod*0.7);
    nr=normalize(nr+hn.x*tg+hn.y*vec3(0.,1.,0.));
    // the gilt is real gold: full metal, smooth enough to mirror the lamps and the sun, its colour gold's own
    alb=mix(alb,vec3(1.,0.71,0.29)*(0.75+0.35*lum(alb)/max(lum(vec3(1.,0.71,0.29)),0.01)),mt*0.6);
    Surf m=Surf(alb,mix(0.42,0.17,mt),mt,vec3(0.));
    vec3 F0=mix(vec3(0.04),alb,m.m);
    float nv=max(dot(nr,V),0.);
    vec3 Fe=F0+(1.-F0)*pow(1.-nv,5.)*(1.-m.r);
    vec3 col=(1.-m.m)*alb*E+Fe*G*(0.25+1.6*mt);
    if(sunV>0.&&dot(nr,SUN)>0.) col+=SUNC*0.45*sunV*brdf(nr,V,SUN,m)*dot(nr,SUN); // less than full sun: at full the lacquer burns out to flat pink
    for(int k=0;k<3+uZero;k++){ vec3 l=normalize(lp[k]-P); float nl=dot(nr,l); if(nl>0.) col+=LAMPC*li[k]*lv[k]*brdf(nr,V,l,m)*nl; }
    sum+=col;
  }
  return sum/float(ns);
}

vec3 shade(vec3 p,vec3 n,vec3 rd,Surf s){
  vec3 c=s.e+direct(p,n,-rd,s,true,true)+s.a*(1.-s.m)*ambient(p+n*0.06,n);
  if(s.m>0.5){ vec3 F0=s.a; c+=F0*ambient(p+n*0.06,reflect(rd,n))*(1.-s.r*0.6); }
  return c;
}

vec3 handleShade(vec3 p,vec3 rd,float phi){
  vec3 n=vec3(0.);
  for(int k=0;k<4+uZero;k++){ vec3 e=0.5773*(2.*vec3(float(((k+3)>>1)&1),float((k>>1)&1),float(k&1))-1.); n+=e*handles(p+e*0.0006,phi); }
  n=normalize(n);
  float lit=smoothstep(0.86,0.95,p.y);
  Surf m=Surf(mix(vec3(0.012,0.006,0.004),vec3(0.12,0.05,0.022),lit),0.28,0.,vec3(0.));
  vec3 c=m.a*ambient(p+n*0.05,n)+0.04*ambient(p+n*0.05,reflect(rd,n))*pow(1.-max(dot(n,-rd),0.),5.);
  if(winPass(p,SUN)&&dot(n,SUN)>0.) c+=SUNC*brdf(n,-rd,SUN,m)*dot(n,SUN);
  vec3 l=LAMP_R-p; float d2=dot(l,l); l=normalize(l); c+=LAMPC*0.9/d2*brdf(n,-rd,l,m)*max(dot(n,l),0.);
  l=LAMP_L-p; d2=dot(l,l); l=normalize(l); c+=LAMPC*0.9/d2*brdf(n,-rd,l,m)*max(dot(n,l),0.);
  return c;
}
// The handles over a few moments of the frame, so they blur as the wheel speeds up.
vec3 handlesPass(vec2 fc,float depth,vec3 col){
  vec3 ro=uCam, rd0=camRay(fc);
  float a=dot(rd0.xz,rd0.xz), b=dot(ro.xz,rd0.xz), c=dot(ro.xz,ro.xz)-0.99*0.99;
  float disc=b*b-a*c; if(disc<0.) return col;
  // the span of the ray inside both the handles' cylinder and their height (0.86 to 1.15 m), so no angle cuts them off
  float sq=sqrt(disc), t0=(-b-sq)/a, t1=(-b+sq)/a;
  if(abs(rd0.y)>1e-5){ float ya=(0.86-ro.y)/rd0.y, yb=(1.15-ro.y)/rd0.y; t0=max(t0,min(ya,yb)); t1=min(t1,max(ya,yb)); }
  else if(ro.y<0.86||ro.y>1.15) return col;
  t0=max(t0,0.); t1=min(t1,depth);
  if(t1<=t0) return col;
  int ns=int(clamp(ceil(uBlur*0.93/(t0*2.*uFov/uRes.y)/2.),1.,24.)), tot=max(ns,4);
  vec3 sum=vec3(0.);
  for(int s=0;s<24+uZero;s++){
    if(s>=tot) break;
    vec2 of=vec2(fract(float(s)*0.618+0.25),fract(float(s)*0.382+0.75))-0.5;
    vec3 rd=camRay(fc+of);
    float ph=uPhi-uBlur*(float(s%ns)+0.5)/float(ns);
    float t=max(t0-0.03,0.); bool hit=false;
    for(int i=0;i<48+uZero;i++){ float d=handles(ro+rd*t,ph); if(d<0.0005){ hit=true; break; } t+=d; if(t>t1+0.03) break; }
    sum+=hit?handleShade(ro+rd*t,rd,ph):col;
  }
  return sum/float(tot);
}

bool wheelShadow(vec3 p){
  vec2 o2=p.xz, d=normalize(SUN.xz); float b=dot(o2,d), c=dot(o2,o2)-0.8*0.8, disc=b*b-c;
  if(disc<0.) return false;
  float t2=-b+sqrt(disc); if(t2<0.) return false;
  float tt=max(-b-sqrt(disc),0.)/length(SUN.xz), y=p.y+SUN.y*tt;
  return y>0.3&&y<3.3;
}
bool pillarShadow(vec3 p){
  for(int i=0;i<4+uZero;i++){ vec3 q=p-PIL[i]; float tt=-dot(q.xz,SUN.xz)/dot(SUN.xz,SUN.xz); if(tt<0.) continue; vec3 c=q+SUN*tt; if(length(c.xz)<0.17&&c.y<3.6) return true; }
  return false;
}
// The sunbeam: light scattered toward the eye by drifting incense smoke where the sun reaches.
vec4 beam(vec2 fc,vec3 rd,float depth){
  float tm=min(depth,14.), N=26.;
  float j=fract(52.9829189*fract(dot(fc,vec2(0.06711056,0.00583715))));
  float dt=tm/N, mu=dot(rd,SUN), g=0.55, ph=(1.-g*g)/(4.*PI*pow(1.+g*g-2.*g*mu,1.5));
  float T=1.; vec3 L=vec3(0.);
  for(float k=0.;k<26.+float(uZero);k+=1.){
    vec3 p=uCam+rd*(k+j)*dt;
    float sm=fbm3(p*vec3(1.4,0.9,1.4)+vec3(0.,-uTime*0.09,uTime*0.035));
    float dens=0.002+0.09*smoothstep(0.5,0.85,sm)*exp(-max(p.y-0.2,0.)*0.6);
    if(winPass(p,SUN)&&!wheelShadow(p)&&!pillarShadow(p)) L+=T*dens*dt*ph*SUNC;
    L+=T*dens*dt*vec3(0.012,0.008,0.004);
    T*=exp(-dens*dt*0.5);
  }
  return vec4(L*0.4,T);
}
vec3 flame(vec3 rd,float depth,vec3 fp,float i,float sz){
  vec3 w=fp-uCam; float t=dot(rd,w); if(t>depth+0.05||t<0.) return vec3(0.);
  vec3 c=uCam+rd*t-fp;
  float fl=1.+0.12*sin(uTime*11.+i*2.3)+0.08*sin(uTime*23.7+i*5.1), lean=0.004*sin(uTime*3.1+i);
  float hx=length(vec2(c.x-lean*(c.y+0.01)*40.,c.z))/(0.0075*sz), hy=(c.y-0.008*sz)/(0.02*fl*sz);
  float shape=exp(-(hx*hx*(1.+max(hy,0.)*1.6)+hy*hy)*1.6);
  return shape*mix(vec3(4.,1.6,0.35),vec3(9.,7.,4.),exp(-hy*hy*4.))*6.+vec3(1.,0.45,0.12)*0.03/(1.+dot(c,c)*900./sz);
}
vec3 flames(vec3 rd,float depth){
  vec3 L=vec3(0.);
  for(float i=0.;i<9.+float(uZero);i+=1.) L+=flame(rd,depth,vec3(-3.8+i*0.2,0.665,-2.9),i,1.);
  L+=flame(rd,depth,LAMP_L+vec3(0.,0.02,0.),11.,1.25);
  L+=flame(rd,depth,LAMP_R+vec3(0.,0.02,0.),12.,1.25);
  return L;
}

// Incense smoke from the burner's sticks, rising to the clouds: a thin column that wavers as it climbs and widens,
// broken by the drifting air, lit by the room's light and bright where it crosses the sunbeam.
const vec3 PB=vec3(-3.,0.74,-2.64);
vec4 plume(vec2 fc,vec3 ro,vec3 rd,float depth){
  vec2 oc=ro.xz-PB.xz; float a=dot(rd.xz,rd.xz), b=dot(oc,rd.xz), c=dot(oc,oc)-0.36, disc=b*b-a*c;
  if(a<1e-6||disc<0.) return vec4(0.,0.,0.,1.);
  float s=sqrt(disc), t0=(-b-s)/a, t1=(-b+s)/a;
  if(abs(rd.y)>1e-5){ float ya=(PB.y-ro.y)/rd.y, yb=(3.9-ro.y)/rd.y; t0=max(t0,min(ya,yb)); t1=min(t1,max(ya,yb)); }
  t0=max(t0,0.); t1=min(t1,depth);
  if(t1<=t0) return vec4(0.,0.,0.,1.);
  const float N=24.;
  float dt=(t1-t0)/N, j=fract(52.9829189*fract(dot(fc,vec2(0.0419,0.0731))));
  float mu=dot(rd,SUN), g=0.6, ph=(1.-g*g)/(4.*PI*pow(1.+g*g-2.*g*mu,1.5));
  vec3 A=ambient(PB+vec3(0.,1.,0.),vec3(0.,1.,0.))*2.4+vec3(0.07,0.065,0.06); // the room's light, and the lamps just below
  vec3 L=vec3(0.); float T=1.;
  for(float k=0.;k<N+float(uZero);k+=1.){
    vec3 p=ro+rd*(t0+(k+j)*dt);
    float h=p.y-PB.y;
    vec2 ctr=PB.xz+vec2(sin(h*2.1-uTime*0.9)*0.05*h+0.06*h*sin(uTime*0.13),cos(h*1.7-uTime*0.7)*0.04*h);
    vec3 w=p*vec3(4.,3.,4.)+vec3(0.,-uTime*0.6,0.);
    vec2 d2=p.xz-ctr+(vec2(noise3(w),noise3(w+vec3(5.,2.,9.)))-0.5)*0.14*min(h,1.5);
    float R=0.01+0.09*h*h/(1.+h);
    float dens=22.*exp(-dot(d2,d2)/(R*R)*1.5)/(1.+h*1.2)*(0.5+0.5*noise3(p*7.+vec3(0.,-uTime*0.8,0.)))*smoothstep(0.,0.03,h);
    if(dens<0.003) continue;
    vec3 Li=A;
    if(winPass(p,SUN)&&!wheelShadow(p)&&!pillarShadow(p)) Li+=ph*SUNC*0.4;
    L+=T*dens*dt*Li*vec3(0.9,0.9,0.93);
    T*=exp(-dens*dt*0.8);
  }
  return vec4(L,T);
}

// Showers: now and then a cloud rains for about a quarter of a minute. Two streams of showers, each starting every
// 47 or 61 seconds at a place of its own, drifting with the clouds' wind; the cloud above darkens and thickens.
uniform vec3 uShower[2]; // each stream's centre (x, z) and strength, worked out once a frame by main.js
vec3 shower(int s){ return uShower[s]; }
float rainAt(vec2 xz){
  if(uShower[0].z+uShower[1].z<0.001) return 0.;
  float r=0.;
  for(int s=0;s<2+uZero;s++){ vec3 w=shower(s); r=max(r,w.z*(1.-smoothstep(0.35,0.75,length(xz-w.xy)))); }
  return r;
}
// The rain: streaks falling from the cloud's base to the floor, lit by the room; and where the line of sight stands
// 40 to 42 degrees from the point opposite the sun, the rainbow, violet inside and red outside, with the fainter
// second bow at 51 to 54 degrees in reversed order.
vec3 bowColour(float x){
  vec3 c=clamp(vec3(smoothstep(0.42,0.85,x)+0.35*(1.-smoothstep(0.,0.2,x)),1.-abs(x-0.5)*2.4,1.-smoothstep(0.12,0.55,x)),0.,1.);
  return c*smoothstep(0.,0.12,x)*(1.-smoothstep(0.88,1.,x));
}
vec4 rain(vec2 fc,vec3 ro,vec3 rd,float depth){
  vec3 L=vec3(0.); float T=1.;
  float ang=degrees(acos(clamp(dot(rd,-SUN),-1.,1.)));
  vec3 bow=bowColour((ang-40.)/2.4)+0.35*bowColour((54.-ang)/3.);
  float j=fract(52.9829189*fract(dot(fc,vec2(0.0311,0.0617))));
  for(int s=0;s<2+uZero;s++){
    vec3 w=shower(s); if(w.z<0.01) continue;
    vec2 oc=ro.xz-w.xy; float a=dot(rd.xz,rd.xz), b=dot(oc,rd.xz), c=dot(oc,oc)-0.5625, disc=b*b-a*c;
    if(a<1e-6||disc<0.) continue;
    float sq=sqrt(disc), t0=max((-b-sq)/a,0.), t1=min((-b+sq)/a,depth);
    if(abs(rd.y)>1e-5){ float yb=(3.45-ro.y)/rd.y; if(rd.y>0.) t1=min(t1,yb); else t0=max(t0,yb); }
    if(t1<=t0) continue;
    const float N=14.; float dt=(t1-t0)/N;
    vec3 A=ambient(vec3(w.x,1.6,w.y),vec3(0.,1.,0.))*1.1+vec3(0.015);
    for(float k=0.;k<N+float(uZero);k+=1.){
      vec3 p=ro+rd*(t0+(k+j)*dt);
      float edge=1.-smoothstep(0.35,0.75,length(p.xz-w.xy));
      float streak=smoothstep(0.62,0.9,noise3(vec3(p.x*38.,p.y*1.4+uTime*7.,p.z*38.)));
      float dens=w.z*edge*(0.06+0.9*streak);
      L+=T*dens*dt*(A+bow*SUNC*0.1);
      T*=exp(-dens*dt*0.35);
    }
  }
  return vec4(L,T);
}
// Clouds under the ceiling, a layer from 3.3 m to 4.6 m marched like real clouds: a slow, wide noise field says where
// cloud is (so they gather and part irregularly, never on a grid), the wind carries everything across the room while
// the detail churns, and two more wide fields set each one's kind. The kinds: soft heaps and flat sheets, the sheets
// with round pouches hanging from their undersides (mammatus); towering billowed heaps with flat bases and
// cauliflower tops; and high thin streaks drawn out along the wind.
// They take the room's light from below (the lamps and the sunlit floor) and shade where more cloud lies under them.
const float CL0=3.3, CL1=4.6;
float cloudD(vec3 p){
  float h=(p.y-CL0)/(CL1-CL0);
  vec3 w=vec3(uTime*0.11,0.,uTime*0.045);                         // the wind
  vec3 q=p+w;
  float cov=noise3(q*vec3(0.42,0.7,0.42)+vec3(3.1,0.,7.7));         // where cloud gathers
  float type=noise3(q*0.17+vec3(23.,1.,9.));                        // which kind grows here
  float wS=smoothstep(0.58,0.66,type);                              // streaks
  float wB=smoothstep(0.36,0.44,type)*(1.-wS);                      // billowed towers
  float wA=1.-wS-wB;                                                // heaps and sheets
  float wet=rainAt(p.xz);
  if(cov<0.157&&wS<0.01&&wet<=0.) return 0.;                       // too thin for heaps or towers to form: nothing here
  vec3 r=q*1.9+vec3(0.,uTime*0.03,0.);                              // the detail churns as it goes
  float d=0.;
  if(wA>0.01){
    float kind=noise3(q*0.23+vec3(11.,5.,2.));                      // heaps (1) to sheets (0)
    float top=mix(0.38,1.,kind), bot=mix(0.18,0.02,kind);
    vec2 c=fract(q.xz*1.4+vec2(0.3,0.7))-0.5;                       // mammatus pouches under the sheets
    bot-=(1.-smoothstep(0.1,0.45,length(c)))*(1.-smoothstep(0.2,0.45,kind))*0.15;
    float prof=smoothstep(bot,bot+0.14,h)*(1.-smoothstep(top-0.3,top,h));
    if(prof>0.){
      float f=noise3(r)*0.55+noise3(r*2.3+vec3(1.7,9.2,3.1))*0.3+noise3(r*5.1+vec3(7.,2.,5.))*0.15;
      d+=wA*clamp((cov*0.95+f*0.75-0.9)*2.6,0.,1.)*prof;
    }
  }
  if(wB>0.01){
    float prof=smoothstep(0.03,0.1,h)*(1.-smoothstep(0.8,1.,h));
    if(prof>0.){
      float b=1.-abs(2.*noise3(r*0.75+vec3(5.,3.,1.))-1.), b2=1.-abs(2.*noise3(r*1.8+vec3(2.,8.,4.))-1.);
      d+=wB*clamp((cov+b*0.55+b2*0.3-1.05-h*0.3)*3.4,0.,1.)*prof; // narrower higher up, so they dome
    }
  }
  if(wS>0.01){
    float prof=smoothstep(0.45,0.58,h)*(1.-smoothstep(0.78,0.95,h));
    if(prof>0.){
      vec3 s=vec3(q.x*0.45,q.y*5.,q.z*2.2-q.x*0.5);                 // long along the wind, thin across it
      float f=noise3(s*1.3)*0.6+noise3(s*3.1+vec3(2.,7.,1.))*0.4;
      d+=wS*clamp((f+cov*0.5-0.92)*3.,0.,1.)*prof*0.55;
    }
  }
  if(wet>0.)                                                        // a raining cloud is fuller underneath
  d=max(d,wet*0.85*smoothstep(0.02,0.12,h)*(1.-smoothstep(0.55,0.85,h))*(0.55+0.45*noise3(r)));
  return d;
}
// Fog lying on the floor, below 0.7 m: thickest at the planks and thinning upward, drifting with the room's air in
// slow banks, lit by the room's light from above and glowing where the sunbeam passes through it.
const float FG1=0.7;
vec4 floorFog(vec2 fc,vec3 ro,vec3 rd,float depth){
  float t0=0., t1=min(depth,14.);
  if(ro.y>FG1){ if(rd.y>=0.) return vec4(0.,0.,0.,1.); t0=(FG1-ro.y)/rd.y; }
  else if(rd.y>0.) t1=min(t1,(FG1-ro.y)/rd.y);
  if(t1<=t0) return vec4(0.,0.,0.,1.);
  const float N=14.;
  float dt=(t1-t0)/N, j=fract(52.9829189*fract(dot(fc,vec2(0.00583715,0.06711056))));
  float mu=dot(rd,SUN), g=0.5, ph=(1.-g*g)/(4.*PI*pow(1.+g*g-2.*g*mu,1.5));
  vec3 A=ambient(ro+rd*(t0+t1)*0.5,vec3(0.,1.,0.))*0.9+vec3(0.01,0.009,0.008);
  vec3 L=vec3(0.); float T=1.;
  for(float k=0.;k<N+float(uZero);k+=1.){
    vec3 p=ro+rd*(t0+(k+j)*dt);
    vec3 q=p+vec3(uTime*0.07,0.,uTime*0.03);
    float n=noise3(q*vec3(0.8,2.2,0.8))*0.6+noise3(q*vec3(2.1,4.,2.1)+vec3(4.,1.,7.)-vec3(0.,uTime*0.05,0.))*0.4;
    float dens=1.1*exp(-max(p.y,0.)/FG1*3.2)*smoothstep(0.3,0.75,n);
    if(dens<0.002) continue;
    vec3 Li=A;
    if(winPass(p,SUN)&&!wheelShadow(p)&&!pillarShadow(p)) Li+=ph*SUNC*0.4;
    L+=T*dens*dt*Li*vec3(0.92,0.92,0.95);
    T*=exp(-dens*dt);
  }
  return vec4(L,T);
}
vec4 clouds(vec3 ro,vec3 rd,float depth){
  if(abs(rd.y)<1e-4) return vec4(0.);
  float t0=(CL0-ro.y)/rd.y, t1=(CL1-ro.y)/rd.y;
  if(t0>t1){ float x=t0; t0=t1; t1=x; }
  t0=max(t0,0.); t1=min(t1,min(depth,12.));
  if(t1<=t0) return vec4(0.);
  const int N=28;
  float dt=(t1-t0)/float(N), j=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
  vec3 L=ambient(ro+rd*(t0+t1)*0.5,vec3(0.,-1.,0.))*2.2+vec3(0.12,0.11,0.1); // light from below, and a little glow
  vec3 C=vec3(0.); float T=1.;
  for(int i=0;i<N+uZero;i++){
    vec3 p=ro+rd*(t0+(float(i)+j)*dt);
    float d=cloudD(p);
    if(d>0.004){
      float under=cloudD(p-vec3(0.,0.22,0.));                      // cloud between this point and the light below
      float lit=exp(-under*2.2)*(0.55+0.45*(p.y-CL0)/(CL1-CL0)+0.3); // shaded where cloud lies beneath, brighter higher up
      float a=1.-exp(-d*dt*7.);
      lit*=1.-0.6*rainAt(p.xz);                                     // and darker
      C+=T*a*vec3(0.93,0.91,0.89)*L*lit;
      T*=1.-a;
      if(T<0.03) break;
    }
  }
  return vec4(C,1.-T);
}

vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
// Khronos PBR Neutral: linear up to the shoulder, then the brightest channel rolled off toward white while the hue and
// saturation are kept, so lamp-lit gilt and painted walls keep their colour and the darks stay dark.
vec3 neutral(vec3 c){
  const float s=0.76, d=0.15;
  float x=min(c.r,min(c.g,c.b)), off=x<0.08?x-6.25*x*x:0.04; c-=off;
  float p=max(c.r,max(c.g,c.b)); if(p<s) return c;
  float d2=1.-s, np=1.-d2*d2/(p+d2-s); c*=np/p;
  float g=1.-1./(d*(p-np)+1.); return mix(c,vec3(np),g);
}

void main(){
  vec2 fc=gl_FragCoord.xy;
  vec3 ro=uCam, rd=camRay(fc);
  Hit h=trace(ro,rd,true);
  float depth=h.sky?40.:h.t;
  vec3 col;
  // what the ray meets, and its surface: everything but the drum and the sky goes through one shade() call, since
  // each call is a copy of all its shadow marching in the compiled shader
  float st, ot; vec3 sn, sc, on, oc;
  vec3 sp=vec3(0.), snr=vec3(0.,1.,0.); Surf sf=Surf(vec3(0.5),0.8,0.,vec3(0.)); int kind=0; // 0 sky, 1 drum, 2 shade
  vec4 mn=uModels>0.5?texelFetch(uMN,ivec2(fc),0):vec4(0.);
  bool model=mn.w>0.&&mn.w<depth, offer=false, statue=false, gilt=false;
  if(model){
    depth=mn.w; sp=ro+rd*mn.w; vec4 ma=texelFetch(uMA,ivec2(fc),0);
    snr=mn.xyz; if(dot(snr,rd)>0.) snr=-snr;
    sc=ma.rgb*ma.rgb; gilt=ma.a>0.75; kind=2;
    sf=Surf(gilt?sc:sc*0.6,gilt?0.55:0.5,0.,vec3(0.));
  }
#ifndef NO_CARDS
  else if(uModels<0.5){
    offer=offerHit(ro,rd,depth,ot,on,oc);
    if(offer){ depth=ot; sp=ro+rd*ot; snr=on; sf=Surf(oc,0.5,0.,vec3(0.)); kind=2; }
    else if(statueHit(ro,rd,st,sn,sc)&&st<depth){ depth=st; sp=ro+rd*st; snr=sn; sf=Surf(sc,0.55,0.,vec3(0.)); gilt=true; kind=2; }
  }
#endif
  if(kind==0&&!h.sky){
    sp=ro+rd*h.t;
    if(h.id>19.5&&h.id<20.5) kind=1;
    else { snr=h.n; sf=surface(sp,h.n,h.id); kind=2; }
  }
  if(gilt){ // the statue's gilt (yellow, bright, saturated in the picture) shines as metal
    float g=smoothstep(0.08,0.3,sc.r-sc.b)*smoothstep(0.1,0.3,lum(sc))*0.7;
    sf=Surf(mix(sc,sc*1.3,g),mix(0.55,0.35,g),g,vec3(0.));
  }
  if(kind==2) col=shade(sp,snr,rd,sf);
  else if(kind==1) col=drumShade(sp,rd,h.t);
  else col=outside(rd);
#ifndef NO_HANDLES
  col=handlesPass(fc,depth,col);
#endif
#ifndef NO_BEAM
  vec4 bm=beam(fc,rd,depth);
  col=col*bm.w+bm.rgb;
#endif
#ifndef NO_FOG
  vec4 fg=floorFog(fc,ro,rd,depth); col=col*fg.w+fg.rgb;
#endif
#ifndef NO_PLUME
  vec4 pl=plume(fc,ro,rd,depth); col=col*pl.w+pl.rgb;
#endif
#ifndef NO_RAIN
  vec4 rn=rain(fc,ro,rd,depth); col=col*rn.w+rn.rgb;
#endif
#ifndef NO_CLOUDS
  vec4 cl=clouds(ro,rd,depth); col=col*(1.-cl.a)+cl.rgb;
#endif
  col+=flames(rd,depth);
  vec2 uv=fc/uRes;
  col*=uExpo*(1.-0.3*pow(length((uv-0.5)*vec2(1.,0.7)),2.2));
  vec3 c=pow(uTone>0.5?aces(col):neutral(col),vec3(1./2.2));
  c+=(hash3(vec3(fc,uTime))-0.5)/255.;
  o=vec4(c,1.);
}`;

// The models pass: the statue and the offerings as meshes made in Blender, drawn with the frame's own camera into the
// model buffers (colour, and normal with distance from the eye), which the frame shader takes where they are nearer
// than what its ray meets. The painting is projected on from the front, so the texture's keyed-out green cuts the
// outline cleanly; surfaces facing up take Codex's painting of the offering from above.
const MESH_VS = /*glsl*/`#version 300 es
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
layout(location=2) in vec2 aT;
layout(location=3) in vec2 aU;
uniform mat3 uView; uniform vec3 uCam; uniform vec2 uRes; uniform float uFov;
out vec3 vP; out vec3 vN; out vec2 vT; out vec2 vU;
void main(){
  vec3 p=vec3((aP.x+32768.)/8000.-4.,(aP.y+32768.)/8000.,(aP.z+32768.)/8000.-4.);
  vP=p; vN=aN; vT=aT; vU=aU;
  vec3 v=transpose(uView)*(p-uCam);
  const float n=0.03, f=40.;
  gl_Position=vec4(v.x*uRes.y/(uFov*uRes.x),v.y/uFov,v.z*(f+n)/(f-n)-2.*f*n/(f-n),v.z);
}`;
const MESH_FS = /*glsl*/`#version 300 es
precision highp float;
uniform sampler2D uStatue, uOffer, uOfferTop; uniform int uWhich; uniform vec3 uCam;
in vec3 vP; in vec3 vN; in vec2 vT; in vec2 vU;
layout(location=0) out vec4 oA;
layout(location=1) out vec4 oN;
void main(){
  vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
  vec4 c=uWhich==0?texture(uStatue,vT):texture(uOffer,vT);
  if(uWhich==1){ // surfaces facing up take the painting of the offering from above, where it has one
    vec4 t=texture(uOfferTop,vU);
    float k=smoothstep(0.3,0.75,n.y)*step(0.5,t.a);
    c=mix(c,t,k);
  }
  if(c.a<0.5) discard;
  oA=vec4(c.rgb,uWhich==0?1.:0.5);
  oN=vec4(n,length(vP-uCam));
}`;
