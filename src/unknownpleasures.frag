//---------------------------------------------------------------------
// Unknown Pleasures
// Inspired by the Joy Division cover art, with radio waves from pulsar
//
// 2021-05-10 - Initial version
//---------------------------------------------------------------------

#ifdef GL_ES
precision highp float;
#endif

varying vec2 v_texcoord;
uniform vec2 iResolution;
uniform float iTime;

#define MAX_STEPS 128
#define AA 1

const float PI = 3.14159265359;
const float SPEED = 1.2;
const float FOV = 60.;
const float ROW_SPACING = .2;
const float HIT_EPS = .001;
const float STEP_SCALE = .25;

// Triangle wave
float zigzag(float x){ return abs(fract(x) - .5) * 2. - .5; }

// Smoothly varying time so the wave speeds up and slows down
float wavyTime(){
    return iTime * SPEED + .8 * sin(iTime * .5) + .5 * sin(iTime * .83 + 1.7);
}

// Current wave speed
float wavySpeed(){
    return SPEED + .4 * cos(iTime * .5) + .415 * cos(iTime * .83 + 1.7);
}

float terrainHeight(vec3 pos){
    float t = wavyTime();
    // Faster movement gives higher peaks and deeper valleys
    float speedGain = .65 + .35 * wavySpeed() / 1.4;
    float phase = pos.z * .5 + t;
    // Sweep amplitude
    float sweep = 1.3 + .7 * sin(iTime * .27) + .3 * sin(iTime * .61 + 2.1);
    float bump = cos(clamp(pos.x + sin(phase) * sweep, -PI, PI)) * .5 + .5;
    float swell = pow(abs(bump), 4.) * sin(phase) * 3.;
    // Seismic jaggedness
    float spikes = zigzag(pos.x * .55 + pos.z * .9) * .35
                 + zigzag(pos.x * 1.3 - pos.z * 1.7 + t * .3) * .18;
    float h = (swell + spikes * bump * bump * bump) * speedGain;

    // small, smooth per-row variation of peak height and valley depth
    float peakVar   = .88 + .15 * sin(pos.z * .8 + iTime * .6) + .1 * sin(pos.z * 1.9 - iTime * .9);
    float valleyVar = .5 + .12 * sin(pos.z * 1.3 + iTime * .45) + .08 * sin(pos.z * .6 - iTime * .7);
    return h < 0. ? h * valleyVar : h * peakVar;
}

// ---------- Camera ----------

mat3 cameraBasis(vec3 target, vec3 eye){
    vec3 fwd   = normalize(target - eye);
    vec3 right = normalize(cross(fwd, vec3(0., 1., 0.)));
    vec3 up    = cross(right, fwd);
    return mat3(right, up, -fwd);
}

vec3 pixelRay(vec2 fragCoord, vec2 res, float fovDeg){
    vec2 xy = fragCoord - res * .5;
    float focal = res.y / tan(radians(fovDeg) * .5);
    return normalize(vec3(xy, -focal));
}

// ---------- Ray marching ----------

float carve(float cutter, float solid){ return max(-cutter, solid); }

float sceneDist(vec3 pos){
    float local = mod(pos.z, ROW_SPACING) - ROW_SPACING * .5;
    float slit = carve(local + HIT_EPS, local - HIT_EPS);
    return carve(-pos.y + terrainHeight(pos), slit);
}

float rayMarch(vec3 dir, vec3 origin){
    // Returns the travelled distance, or -1. when nothing is hit
    float t = 0.;
    for(int i = 0; i < MAX_STEPS; i++){
        float d = sceneDist(origin + dir * t);
        if(d < HIT_EPS) return t;
        t += d * STEP_SCALE;
    }
    return -1.;
}

// ---------- Shading ----------

float heightShade(float h){
    // Shade by height
    return h > 0. ? mix(.35, 1., clamp(h / 3., 0., 1.))
                  : mix(.35, .12, clamp(-h / 1.5, 0., 1.));
}

vec3 shade(vec3 dir, vec3 origin){
    float t = rayMarch(dir, origin);
    if(t < 0.) return vec3(0.);

    vec3 hitPos = origin + dir * t;
    float h = terrainHeight(hitPos);
    float line = smoothstep(.05, 0., abs(hitPos.y - (h - .05)));
    return vec3(line * heightShade(h));
}

vec3 renderPixel(vec2 fragCoord){
    vec3 origin = vec3(0., 10., 10.);
    mat3 basis = cameraBasis(vec3(0.), origin);
    vec3 dir = basis * pixelRay(fragCoord, iResolution.xy, FOV);
    return shade(dir, origin);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec3 sum = vec3(0.);
    for(int y = 0; y < AA; ++y){
        for(int x = 0; x < AA; ++x){
            vec2 offset = vec2(float(x), float(y)) / float(AA);
            sum += clamp(renderPixel(fragCoord + offset), 0., 1.);
        }
    }
    fragColor = vec4(sum / float(AA * AA), 1.);
}

void main(void)
{
    mainImage(gl_FragColor, v_texcoord * iResolution.xy);
}