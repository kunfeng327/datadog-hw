#!/usr/bin/env python3
"""Author the bundled, rigged GLB character and botanical diorama.

Python standard library only. Run from any directory; no downloads or runtime
geometry generation. Surfaces are sculpted as continuous implicit meshes;
facial details, tailoring and foliage are authored directly into vertex data.
"""
import bisect
import json
import math
import struct
import zlib
from functools import lru_cache
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'src' / 'assets'
PI = math.pi

def add(a, b): return tuple(x + y for x, y in zip(a, b))
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def mul(a, s): return tuple(x * s for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a): return mul(a, 1 / max(1e-12, math.sqrt(dot(a, a))))
def mix(a, b, t): return a + (b - a) * t
def clamp(t): return max(0, min(1, t))
def smooth(a, b, x):
    t = clamp((x-a)/(b-a))
    return t*t*(3-2*t)
def smin(a, b, k=.045):
    h = max(k-abs(a-b), 0)/k
    return min(a, b) - h*h*k*.25

def color(hex_color, shade=1):
    rgb = [int(hex_color[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple((v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4)*shade for v in rgb)

SKIN = '#bd8864'
GREEN = '#45664f'
PANTS = '#303e3c'
CREAM = '#e8dfc8'
DARK = '#302e28'

class Mesh:
    def __init__(self):
        self.positions, self.faces, self.colors = [], [], []
    def vertex(self, point, tint):
        self.positions.append(tuple(point)); self.colors.append(tuple(tint))
        return len(self.positions)-1
    def face(self, a, b, c): self.faces.append((a, b, c))
    def grid(self, points, rows, cols, tints):
        start = len(self.positions)
        for p, c in zip(points, tints): self.vertex(p, c)
        for row in range(rows-1):
            for col in range(cols-1):
                a = start + row*cols+col
                self.face(a, a+1, a+cols)
                self.face(a+1, a+cols+1, a+cols)
    def normals(self):
        values = [[0., 0., 0.] for _ in self.positions]
        for a, b, c in self.faces:
            n = cross(sub(self.positions[b], self.positions[a]), sub(self.positions[c], self.positions[a]))
            for i in (a, b, c):
                for k in range(3): values[i][k] += n[k]
        return [norm(n) if dot(n,n)>1e-20 else (0,1,0) for n in values]

# Horizontal sculpting profiles: height, half-width, half-depth, front offset.
HEAD = ((.94,.11,.11,0),(1.06,.105,.105,0), (1.19,.14,.14,.025), (1.25,.205,.185,.03),
        (1.34,.254,.205,.02), (1.44,.276,.218,.01), (1.56,.269,.216,0),
        (1.67,.255,.208,-.01), (1.76,.211,.182,-.02), (1.82,.14,.135,-.02),
        (1.85,.035,.035,-.02))
TORSO = ((-.045,.24,.16,0), (.04,.274,.173,0), (.18,.275,.18,0),
         (.38,.296,.195,0), (.64,.335,.205,0), (.83,.365,.185,-.005),(.90,.365,.171,-.005),
         (.96,.25,.145,-.005), (1.015,.125,.118,0))
ARM = ((-.29,.02,.03,.06),(-.25,.076,.058,.045),(-.15,.087,.069,.025),
       (-.055,.069,.066,.01),(.08,.079,.078,0),(.28,.105,.095,0),
       (.42,.115,.10,0),(.58,.126,.111,0),(.77,.14,.13,0),(.90,.14,.133,0),
       (.99,.07,.085,0))
LEG = ((-1.12,.095,.102,.005),(-.93,.105,.113,0),(-.67,.111,.119,-.015),
       (-.49,.12,.131,.005),(-.24,.148,.145,0),(.04,.166,.158,0),(.15,.11,.12,0))
SHOE = ((-1.255,.085,.188,.08),(-1.24,.132,.241,.09),(-1.195,.14,.246,.09),
        (-1.15,.134,.235,.09),(-1.085,.115,.183,.04),(-1.01,.104,.111,.005),
        (-.975,.08,.075,0))

@lru_cache(maxsize=8192)
def profile(rows, y):
    i = max(0, min(len(rows)-2, bisect.bisect_right([p[0] for p in rows], y)-1))
    t = clamp((y-rows[i][0])/(rows[i+1][0]-rows[i][0]))
    values=[]
    for k in (1,2,3):
        before,after=rows[max(0,i-1)],rows[min(len(rows)-1,i+2)]
        m0=(rows[i+1][k]-before[k])/(rows[i+1][0]-before[0])
        m1=(after[k]-rows[i][k])/(after[0]-rows[i][0])
        dy=rows[i+1][0]-rows[i][0]
        v=(2*t**3-3*t*t+1)*rows[i][k]+(t**3-2*t*t+t)*dy*m0+(-2*t**3+3*t*t)*rows[i+1][k]+(t**3-t*t)*dy*m1
        values.append(max(.004,v) if k<3 else v)
    return tuple(values)

def surface(rows, x, y, z):
    rx, rz, cz = profile(rows, y)
    radial = (math.hypot(x/rx, (z-cz)/rz)-1)*min(rx, rz)
    vertical = max(rows[0][0]-y, y-rows[-1][0])
    return min(max(radial, vertical), 0) + math.hypot(max(radial, 0), max(vertical, 0))

def ellipsoid(x,y,z,cx,cy,cz,rx,ry,rz):
    return (math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2)-1)*min(rx,ry,rz)

def sculpt(x,y,z):
    fields = []
    if y > .98:
        head = surface(HEAD,x,y,z)
        # The nose, cheeks, brow and ears blend into the same watertight surface.
        if 1.27 < y < 1.67:
            head = smin(head, ellipsoid(x,y,z,0,1.47,.219,.059,.111,.085), .035)
            head = smin(head, ellipsoid(x,y,z,0,1.405,.249,.075,.056,.079), .038)
            head = smin(head, ellipsoid(abs(x),y,z,.133,1.56,.169,.12,.042,.063), .035)
            head = smin(head, ellipsoid(abs(x),y,z,.278,1.455,-.014,.054,.10,.049), .03)
        fields.append(head)
    if -.095 < y < 1.07:
        fields.append(surface(TORSO,x,y,z))
    if -.34 < y < 1.04:
        arm_x = .43 + (.90-y)*.19
        arm = surface(ARM,abs(x)-arm_x,y,z)
        if -.24 < y < -.01:
            arm = smin(arm,ellipsoid(abs(x),y,z,.55,-.105,.055,.049,.092,.048),.026)
        fields.append(arm)
    if y < .20:
        legs = surface(LEG,abs(x)-.17,y,z)
        pelvis = surface(((-.13,.205,.155,0),(.03,.27,.17,0),(.165,.22,.15,0)),x,y,z)
        fields.append(smin(legs,pelvis,.05))
    if y < -.92:
        fields.append(surface(SHOE,abs(x)-.17,y,z))
    result = 9.
    for f in fields: result = smin(result,f)
    return result

def skin_color(p):
    x,y,z = p
    shade = .92 + .08*smooth(-.1,.22,z)
    if y > .985 or (abs(x) > .39 and y < .24):
        tint=color(SKIN,shade)
        if y > 1.25:
            blush=math.exp(-((abs(x)-.19)/.08)**2-((y-1.39)/.085)**2)*.12
            tint=tuple(mix(a,b,blush) for a,b in zip(tint,color('#af6851')))
        if abs(x)>.39 and y<.24:
            skin_amount=1-smooth(.175,.215,y)
            tint=tuple(mix(a,b,skin_amount) for a,b in zip(color('#b9c1a8',shade),tint))
        if y>.985:
            skin_amount=smooth(.985,1.015,y)
            tint=tuple(mix(a,b,skin_amount) for a,b in zip(color(GREEN,shade),tint))
        return tint
    if y < -1.19:return color('#d8d0bb',shade)
    if y < -.99:
        trouser=smooth(-1.045,-1.005,y)
        return tuple(mix(a,b,trouser) for a,b in zip(color('#e9e1ce',shade),color(PANTS,shade)))
    if y < .06:
        jacket=smooth(.015,.055,y)
        return tuple(mix(a,b,jacket) for a,b in zip(color(PANTS,shade),color(GREEN,shade)))
    tint=color(GREEN,shade)
    if z>0 and y>.74:
        width=.10*clamp((y-.75)/.24)
        opening=(1-smooth(width-.012,width+.012,abs(x)))*smooth(.74,.77,y)
        tint=tuple(mix(a,b,opening) for a,b in zip(tint,color(CREAM,shade)))
    return tint

# Marching tetrahedra weld all cut edges: no intersecting primitive body parts.
def implicit_mesh(step=.041):
    mesh = Mesh()
    bounds = ((-.79,.79),(-1.29,1.89),(-.31,.39))
    axes = [[lo+(hi-lo)*i/math.ceil((hi-lo)/step) for i in range(math.ceil((hi-lo)/step)+1)] for lo,hi in bounds]
    xs,ys,zs = axes; nx,ny,nz = map(len,axes)
    points = [(x,y,z) for y in ys for z in zs for x in xs]
    field = [sculpt(*p) for p in points]
    edges = {}
    tetra = ((0,1,3,7),(0,3,2,7),(0,2,6,7),(0,6,4,7),(0,4,5,7),(0,5,1,7))
    offsets = (0,1,nx,nx+1,nx*nz,nx*nz+1,nx*nz+nx,nx*nz+nx+1)
    def cut(a,b):
        key = tuple(sorted((a,b)))
        if key not in edges:
            t = field[a]/(field[a]-field[b])
            p = add(points[a],mul(sub(points[b],points[a]),t))
            edges[key] = mesh.vertex(p,skin_color(p))
        return edges[key]
    for iy in range(ny-1):
        for iz in range(nz-1):
            for ix in range(nx-1):
                origin = (iy*nz+iz)*nx+ix
                corners = [origin+k for k in offsets]
                inside = [field[k]<0 for k in corners]
                if all(inside) or not any(inside): continue
                for cell in tetra:
                    yes = [corners[k] for k in cell if inside[k]]
                    no = [corners[k] for k in cell if not inside[k]]
                    if not yes or not no: continue
                    if len(yes)==1: poly = [cut(yes[0],b) for b in no]
                    elif len(no)==1: poly = [cut(a,no[0]) for a in yes]
                    else: poly = [cut(yes[0],no[0]),cut(yes[0],no[1]),cut(yes[1],no[1]),cut(yes[1],no[0])]
                    outward = sub(points[no[0]],points[yes[0]])
                    a,b,c = (mesh.positions[k] for k in poly[:3])
                    if dot(cross(sub(b,a),sub(c,a)),outward)<0: poly.reverse()
                    mesh.face(*poly[:3])
                    if len(poly)==4: mesh.face(poly[0],poly[2],poly[3])
    # A small offline Taubin pass removes sampling artifacts without adding faces.
    neighbors=[set() for _ in mesh.positions]
    for a,b,c in mesh.faces:
        neighbors[a].update((b,c));neighbors[b].update((a,c));neighbors[c].update((a,b))
    for rate in (.45,-.47,.45,-.47):
        points=mesh.positions
        mesh.positions=[add(p,mul(sub(tuple(sum(points[j][k] for j in adjacent)/len(adjacent) for k in range(3)),p),rate)) if adjacent else p for p,adjacent in zip(points,neighbors)]
    mesh.colors=[skin_color(p) for p in mesh.positions]
    return mesh

def front_z(x,y):
    lo,hi = -.08,.43
    for _ in range(22):
        mid = (lo+hi)/2
        if sculpt(x,y,mid)<0: lo = mid
        else: hi = mid
    return (lo+hi)/2+.007

def ribbon(mesh, points, width, tint, depth=0):
    vertices, tints = [],[]
    for i,(x,y) in enumerate(points):
        before,after = points[max(0,i-1)],points[min(len(points)-1,i+1)]
        dx,dy = after[0]-before[0],after[1]-before[1]
        length = max(1e-8,math.hypot(dx,dy)); ox,oy = -dy/length*width/2, dx/length*width/2
        taper=.25+.75*math.sin(PI*(i+.5)/len(points))**.35
        for side in (-1,1):
            px,py = x+side*ox*taper,y+side*oy*taper
            vertices.append((px,py,front_z(px,py)+depth)); tints.append(color(tint))
    mesh.grid(vertices,len(points),2,tints)

def face_patch(mesh,cx,cy,rx,ry,tint,almond=False,layer=0):
    # Concentric curved rings prevent flat decals from intersecting the face.
    center = mesh.vertex((cx,cy,front_z(cx,cy)+layer*.004),color(tint))
    rings=[]
    for r in range(1,6):
        ring=[]
        for i in range(33):
            t=i/32*2*PI;scale=r/5
            x=cx+rx*math.cos(t)*scale
            y=cy+ry*math.sin(t)*scale*(abs(math.sin(t))**.28 if almond else 1)
            ring.append(mesh.vertex((x,y,front_z(x,y)+layer*.004),color(tint)))
        rings.append(ring)
    for i in range(32):mesh.face(center,rings[0][i],rings[0][i+1])
    for before,after in zip(rings,rings[1:]):
        for i in range(32):
            mesh.face(before[i],after[i],after[i+1]);mesh.face(before[i],after[i+1],before[i+1])

def character_details(mesh):
    for side in (-1,1):
        # Almond eyes and curved brows sit on the sculpt rather than bead eyes.
        face_patch(mesh,side*.124,1.511,.078,.030,'#eee5d2',True,layer=1)
        face_patch(mesh,side*.121,1.511,.026,.027,'#655a40',layer=2)
        face_patch(mesh,side*.121,1.511,.015,.021,'#242c29',layer=3)
        face_patch(mesh,side*.111,1.523,.005,.006,'#fff8e6',layer=4)
        ribbon(mesh,[(side*(.052+i*.010),1.56+.018*math.sin(i/14*PI)+( .009 if side<0 else 0)) for i in range(15)],.015,DARK)
        ribbon(mesh,[(side*(.051+i*.011),1.512+.030*math.sin(i/13*PI)) for i in range(14)],.006,'#79573f',depth=.013)
        face_patch(mesh,side*.027,1.395,.014,.007,'#7b4b37')
        # Cloth panel seams, pocket welts and sneaker laces are baked mesh detail.
        ribbon(mesh,[(side*(.22-.06*t),.80-.64*t) for t in [i/20 for i in range(21)]],.007,'#60765b')
        ribbon(mesh,[(side*(.11+.09*t),.32+.034*t) for t in [i/12 for i in range(13)]],.011,'#a5af91')
        for y in (-1.105,-1.13,-1.155):
            ribbon(mesh,[(side*.17-.055+i*.011,y) for i in range(11)],.008,'#b3ac98')
    # Quiet smile and cleanly tailored jacket opening.
    ribbon(mesh,[(-.105+i*.010,1.337-.012*math.sin(i/21*PI)) for i in range(22)],.010,'#8b5741')
    ribbon(mesh,[(0,.105+i*.027) for i in range(23)],.009,'#baac83')
    ribbon(mesh,[(-.10+i*.01,.75+.23*abs((i-10)/10)) for i in range(21)],.010,'#a8b396')
    # A small botanical chest emblem, authored as connected strokes.
    ribbon(mesh,[(-.163+.018*math.sin(i/12*PI),.67+i*.004) for i in range(13)],.005,CREAM)
    ribbon(mesh,[(-.163-i*.002,.69+i*.003) for i in range(8)],.005,CREAM)


def joint_weights(p):
    x,y,z=p
    # Blend only at the shoulder attachment; the entire free arm must move.
    # A narrow torso exclusion keeps hips and ears rigid without stretching hands.
    shoulder = smooth(.55,.85,y)
    arm = smooth(mix(.34,.30,shoulder),mix(.42,.44,shoulder),abs(x)) if -.4<y<1.04 else 0
    fore = 1-smooth(.32,.51,y)
    shoulder,elbow = (1,2) if x<0 else (3,4)
    return (0,shoulder,elbow,0),(1-arm,arm*(1-fore),arm*fore,0)

class GLB:
    def __init__(self):
        self.binary=bytearray()
        self.doc={'asset':{'version':'2.0','generator':'Rock Studio original asset authoring'},'scene':0,'scenes':[{'nodes':[]}],
                  'nodes':[],'meshes':[],'materials':[],'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[]}
    def view(self,data,target=None):
        while len(self.binary)%4:self.binary.append(0)
        i=len(self.doc['bufferViews']);v={'buffer':0,'byteOffset':len(self.binary),'byteLength':len(data)}
        if target:v['target']=target
        self.doc['bufferViews'].append(v);self.binary.extend(data);return i
    def accessor(self,values,kind='VEC3',component=5126,bounds=False):
        size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[kind]
        flat=[v for row in values for v in (row if size>1 else [row])]
        fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[component]
        a={'bufferView':self.view(struct.pack('<'+fmt*len(flat),*flat)), 'componentType':component,'count':len(values),'type':kind}
        if bounds:
            a['min']=[min(row[i] for row in values) for i in range(size)];a['max']=[max(row[i] for row in values) for i in range(size)]
        self.doc['accessors'].append(a);return len(self.doc['accessors'])-1
    def material(self,name,roughness=.85,double=False):
        self.doc['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':roughness},'doubleSided':double})
        return len(self.doc['materials'])-1
    def mesh(self,name,mesh,material,skin=False):
        attrs={'POSITION':self.accessor(mesh.positions,bounds=True),'NORMAL':self.accessor([norm((sculpt(x+.002,y,z)-sculpt(x-.002,y,z),sculpt(x,y+.002,z)-sculpt(x,y-.002,z),sculpt(x,y,z+.002)-sculpt(x,y,z-.002))) for x,y,z in mesh.positions] if skin else mesh.normals()),'COLOR_0':self.accessor([tuple(round(clamp(c)*255) for c in tint) for tint in mesh.colors],component=5121)}
        self.doc['accessors'][attrs['COLOR_0']]['normalized']=True
        if skin:
            joints,weights=zip(*(joint_weights(p) for p in mesh.positions))
            attrs['JOINTS_0']=self.accessor(joints,'VEC4',5121);attrs['WEIGHTS_0']=self.accessor(weights,'VEC4')
        faces=[i for face in mesh.faces for i in face]
        self.doc['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':self.accessor(faces,'SCALAR',5123 if len(mesh.positions)<65536 else 5125),'material':material}]})
        return len(self.doc['meshes'])-1
    def node(self,**node): self.doc['nodes'].append(node);return len(self.doc['nodes'])-1
    def save(self,name):
        self.doc['buffers'][0]['byteLength']=len(self.binary)
        data=json.dumps(self.doc,separators=(',',':')).encode()
        data+=b' '*((-len(data))%4);self.binary+=b'\0'*((-len(self.binary))%4)
        body=struct.pack('<I4s',len(data),b'JSON')+data+struct.pack('<I4s',len(self.binary),b'BIN\0')+self.binary
        dest=OUT/name;dest.write_bytes(struct.pack('<4sII',b'glTF',2,len(body)+12)+body)
        print(f'{name}: {dest.stat().st_size:,} bytes; '+', '.join(f"{m['name']}: {self.doc['accessors'][m['primitives'][0]['indices']]['count']//3:,} triangles" for m in self.doc['meshes']))


def character():
    model=implicit_mesh();character_details(model)
    glb=GLB();mat=glb.material('Clay, woven cotton and leather',.82,True)
    root=glb.node(name='CharacterRoot',children=[])
    bones=[glb.node(name='Root',children=[])]
    world=[(0,0,0)]
    for name,side in [('L',-1),('R',1)]:
        upper=glb.node(name=f'UpperArm_{name}',translation=[side*.43,.90,0],children=[])
        lower=glb.node(name=f'Forearm_{name}',translation=[side*.09,-.51,0])
        glb.doc['nodes'][upper]['children']=[lower];glb.doc['nodes'][bones[0]]['children'].append(upper)
        bones.extend([upper,lower]);world.extend([(side*.43,.90,0),(side*.52,.39,0)])
    inverse=[]
    for x,y,z in world: inverse.append((1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1))
    glb.doc['skins']=[{'name':'Character arm rig','joints':bones,'skeleton':bones[0],'inverseBindMatrices':glb.accessor(inverse,'MAT4')}]
    node=glb.node(name='SculptedCharacter',mesh=glb.mesh('Continuous sculpt and tailored details',model,mat,True),skin=0)
    glb.doc['nodes'][root]['children']=[bones[0],node];glb.doc['scenes'][0]['nodes']=[root]
    glb.save('rock-character.glb')

# Curved, cupped leaves, stems and petals are baked into shared static meshes.
def leaf(mesh,base,angle,length,width,lean,tint,phase=0):
    points,tints=[],[]
    radial=(math.cos(angle),0,math.sin(angle));across=(-math.sin(angle),0,math.cos(angle))
    for i in range(9):
        t=i/8
        center=add(base,(radial[0]*lean*t*t,length*(t-.25*t*t),radial[2]*lean*t*t))
        w=width*max(.002,math.sin(PI*t)**.72)*(1-.18*t)
        for j in range(5):
            u=(j/4-.5)*2
            p=add(center,mul(across,u*w))
            p=add(p,(radial[0]*.07*math.sin(PI*t)*(1-u*u),-.12*width*u*u*math.sin(PI*t)+.035*math.sin(phase+t*PI)*u,radial[2]*.07*math.sin(PI*t)*(1-u*u)))
            points.append(p)
            tints.append(color(tint,(.82+.18*t)*(.84+.16*(1-abs(u)))))
    mesh.grid(points,9,5,tints)

def stem(mesh,points,radius,tint):
    vertices,tints=[],[]
    for i,p in enumerate(points):
        direction=norm(sub(points[min(len(points)-1,i+1)],points[max(0,i-1)]))
        a=norm(cross(direction,(0,0,1)));b=cross(direction,a)
        for j in range(7):
            q=j/6*2*PI
            vertices.append(add(p,add(mul(a,radius*math.cos(q)),mul(b,radius*math.sin(q)))))
            tints.append(color(tint))
    mesh.grid(vertices,len(points),7,tints)

def flower(mesh,base,height,angle):
    end=add(base,(.13*math.cos(angle),height,.13*math.sin(angle)))
    stem(mesh,[add(base,(.13*math.cos(angle)*t*t,height*t,.13*math.sin(angle)*t*t)) for t in [i/8 for i in range(9)]],.008,'#658157')
    for k in range(8):
        a=k/8*2*PI;points=[];tints=[]
        for i in range(6):
            t=i/5
            for j in range(5):
                u=(j/4-.5)*2;w=.038*math.sin(PI*t)**.5
                p=add(end,(math.cos(a)*(.018+.12*t)-math.sin(a)*w*u,.025*math.sin(PI*t)-.022*t*t+.012*u*u,math.sin(a)*(.018+.12*t)+math.cos(a)*w*u))
                points.append(p);tints.append(color('#f1e8d1',.90+.10*t))
        mesh.grid(points,6,5,tints)
    # Golden seed head is a sculpted crown, not an animated flower object.
    for k in range(12):
        a=k/12*2*PI;b=(k+1)/12*2*PI
        ids=[mesh.vertex(add(end,p),color('#c29945')) for p in [(0,.035,0),(.037*math.cos(a),.008,.037*math.sin(a)),(.037*math.cos(b),.008,.037*math.sin(b))]]
        mesh.face(*ids)


def terrain(mesh):
    points,tints=[],[]
    segments=96;radial_steps=22
    for i in range(radial_steps+1):
        r=i/radial_steps
        for j in range(segments+1):
            a=j/segments*2*PI
            edge=1+.035*math.sin(a*3+.8)+.022*math.sin(a*7)
            x,z=2.02*r*math.cos(a)*edge,1.60*r*math.sin(a)*edge
            y=-1.275+.035*math.sin(x*2)*math.sin(z*2)*smooth(.32,.8,r)-.04*r**5
            points.append((x,y,z))
            path_x=.20*math.sin(z*2)
            path=smooth(.29,.21,abs(x-path_x))*smooth(.05,.32,z)
            base=color('#a7b18c',.95+.05*math.sin(x*11+z*7)*math.sin(z*13))
            sand=color('#cfc2a0',.95+.05*math.sin(x*21-z*9))
            tints.append(tuple(mix(b,s,path) for b,s in zip(base,sand)))
    mesh.grid(points,radial_steps+1,segments+1,tints)
    # Hand-shaped, softly beveled sandstone edge, following the island outline.
    points,tints=[],[]
    for y,scale,shade in [(-1.315,1,1),(-1.34,1.012,.95),(-1.48,.99,.83),(-1.53,.95,.80),(-1.54,.89,.78)]:
        for j in range(segments+1):
            a=j/segments*2*PI;edge=1+.035*math.sin(a*3+.8)+.022*math.sin(a*7)
            points.append((2.02*scale*math.cos(a)*edge,y,1.60*scale*math.sin(a)*edge))
            tints.append(color('#b7a78c',shade*(.96+.04*math.sin(a*17))))
    mesh.grid(points,5,segments+1,tints)


def png_shadow(size=128):
    raw=bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            r=math.hypot((x-size/2)/(size/2),(y-size/2)/(size/2))
            alpha=round(max(0,1-r*r)**3*88)
            raw.extend((42,53,41,alpha))
    def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(raw),9))+chunk(b'IEND',b'')


def garden():
    ground=Mesh();terrain(ground)
    plants=Mesh()
    clusters=[((-1.19,-1.29,-.72),1.20,14),((1.25,-1.29,-.83),1.10,13),
              ((-1.51,-1.29,.35),.61,9),((1.45,-1.29,.43),.72,10),
              ((-.86,-1.29,-1.15),.75,7),((.73,-1.29,-1.16),.82,7)]
    palette=['#587451','#768954','#829c69','#496c51','#a1ac72']
    for k,(base,scale,count) in enumerate(clusters):
        for i in range(count):
            a=i*2.39996+k*.73
            length=scale*(.63+.34*(math.sin(i*17.3+k)**2))
            leaf(plants,base,a,length,.105*scale*(1+.5*math.sin(i*4)**2),.34+.28*(i%3),palette[(i+k)%len(palette)],i)
    for i in range(7):
        a=i*1.71;x=-1.18+.23*math.cos(a);z=.48+.23*math.sin(a)
        flower(plants,(x,-1.29,z),.46+.19*(i%3),a)
    # Fern fronds give a finer silhouette at the front of the diorama.
    for side in (-1,1):
        base=(side*1.09,-1.29,.92)
        for k in range(3):
            angle=side*.6+k*.5;direction=(math.cos(angle)*side,0,math.sin(angle))
            spine=[add(base,(direction[0]*t*.47,.45*math.sin(t*PI*.7),direction[2]*t*.47)) for t in [i/12 for i in range(13)]]
            stem(plants,spine,.006,'#71865b')
            for i in (3,6,9):
                for branch in (-1,1):leaf(plants,spine[i],angle+branch*1.12,.12*(1-i/15),.025,.13,palette[i%5])
    glb=GLB();root=glb.node(name='BotanicalDiorama',children=[])
    for name,mesh,tint in [('Carved sandstone and path',ground,glb.material('Sandstone and moss',1,True)),('Sculpted botanical leaves and flowers',plants,glb.material('Botanical vertex colors',.95,True))]:
        node=glb.node(name=name,mesh=glb.mesh(name,mesh,tint));glb.doc['nodes'][root]['children'].append(node)
    # Two static alpha-textured planes replace all realtime shadow passes.
    shadow=Mesh();uv=[]
    for center,rx,rz in [((0,-1.56,0),2.6,2.0),((0,-1.268,.02),.60,.38)]:
        start=len(shadow.positions)
        for (x,z),(u,v) in zip([(-rx,-rz),(rx,-rz),(-rx,rz),(rx,rz)],[(0,0),(1,0),(0,1),(1,1)]):
            shadow.vertex(add(center,(x,0,z)),(1,1,1));uv.append((u,v))
        shadow.face(start,start+2,start+1);shadow.face(start+1,start+2,start+3)
    image=glb.view(png_shadow());glb.doc['images']=[{'bufferView':image,'mimeType':'image/png'}]
    glb.doc['textures']=[{'source':0}]
    material=glb.material('Baked soft occlusion',1)
    glb.doc['materials'][material].update({'alphaMode':'BLEND','extensions':{'KHR_materials_unlit':{}}})
    glb.doc['materials'][material]['pbrMetallicRoughness']['baseColorTexture']={'index':0}
    glb.doc['extensionsUsed']=['KHR_materials_unlit']
    index=glb.mesh('Baked shadows',shadow,material)
    glb.doc['meshes'][index]['primitives'][0]['attributes']['TEXCOORD_0']=glb.accessor(uv,'VEC2')
    glb.doc['nodes'][root]['children'].append(glb.node(name='Baked shadow planes',mesh=index))
    glb.doc['scenes'][0]['nodes']=[root];glb.save('garden-diorama.glb')

if __name__ == '__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    character();garden()
