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

SKIN = '#f2dfc8'
COAT = '#b49a70'
PANTS = '#d9d5c5'
CREAM = '#e6ebe4'
DARK = '#282927'
HAIR = '#302b2a'

class Mesh:
    def __init__(self):
        self.positions, self.faces, self.colors = [], [], []
        self.sculpt_count = 0
        self.rigid_vertices = set()
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
HEAD = ((.94,.105,.105,0),(1.10,.10,.10,0),(1.19,.11,.12,.025),
        (1.26,.18,.16,.025),(1.37,.237,.196,.018),(1.49,.263,.211,0),
        (1.62,.264,.21,-.01),(1.73,.237,.195,-.018),
        (1.82,.16,.145,-.02),(1.86,.025,.025,-.02))
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
            head = smin(head, ellipsoid(x,y,z,0,1.435,.207,.028,.065,.037), .025)
            head = smin(head, ellipsoid(abs(x),y,z,.259,1.43,-.014,.032,.075,.035), .022)
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
    shade = .94 + .06*smooth(-.15,.22,z)
    if y > 1.16:
        blush=math.exp(-((abs(x)-.18)/.065)**2-((y-1.405)/.05)**2)*.12
        return tuple(mix(a,b,blush) for a,b in zip(color(SKIN,shade),color('#dea398')))
    if y > 1.035: return color(CREAM if abs(x)<.13 else COAT,shade)
    if y > .92: return color(COAT,shade)
    if y > .80 and abs(x)>.22: return color(COAT,shade)
    if abs(x) > .39 and y > -.34:
        if y < -.17: return color(SKIN,shade)
        if y < .20:
            return color(CREAM,shade)
        return color(COAT,shade)
    if y < -1.19: return color('#353733',shade)
    if y < -1.01: return color('#514d42',shade)
    if y < .02: return color(PANTS,shade)
    return color('#272e29',shade)

# Marching tetrahedra weld all cut edges: no intersecting primitive body parts.
def implicit_mesh(step=.045):
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
    mesh.sculpt_count=len(mesh.positions)
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

def face_patch(mesh,cx,cy,rx,ry,tint,layer=0,z=None,bend=0):
    # Concentric curved rings prevent flat decals from intersecting the face.
    center = mesh.vertex((cx,cy,(front_z(cx,cy) if z is None else z)+layer*.004),color(tint))
    rings=[]
    for r in range(1,4):
        ring=[]
        for i in range(25):
            t=i/24*2*PI;scale=r/3
            x=cx+rx*math.cos(t)*scale
            y=cy+ry*math.sin(t)*scale+bend*((x-cx)/rx)**2
            depth=(front_z(x,y) if z is None else z)+layer*.004
            ring.append(mesh.vertex((x,y,depth),color(tint)))
        rings.append(ring)
    for i in range(24):mesh.face(center,rings[0][i],rings[0][i+1])
    for before,after in zip(rings,rings[1:]):
        for i in range(24):
            mesh.face(before[i],after[i],after[i+1]);mesh.face(before[i],after[i+1],before[i+1])

def seam(mesh,points,width,tint):
    """A small raised seam following an explicitly authored clothing surface."""
    vertices=[]
    for i,p in enumerate(points):
        tangent=sub(points[min(i+1,len(points)-1)],points[max(i-1,0)])
        across=mul(norm((-tangent[1],tangent[0],0)),width/2)
        vertices.extend([add(p,across),sub(p,across)])
    mesh.grid(vertices,len(points),2,[color(tint)]*len(vertices))


def tailored_patch(mesh,outline,tint,z_surface):
    """Curved lapel/collar panels, subdivided once into the shared mesh."""
    cx=sum(p[0] for p in outline)/len(outline)
    cy=sum(p[1] for p in outline)/len(outline)
    center=mesh.vertex((cx,cy,z_surface(cx,cy)),color(tint))
    rings=[]
    boundary=[]
    for a,b in zip(outline,outline[1:]+outline[:1]):
        boundary.extend([(mix(a[0],b[0],i/4),mix(a[1],b[1],i/4)) for i in range(4)])
    for r in range(1,4):
        ring=[]
        for x,y in boundary:
            px,py=mix(cx,x,r/3),mix(cy,y,r/3)
            ring.append(mesh.vertex((px,py,z_surface(px,py)),color(tint)))
        rings.append(ring)
    count=len(boundary)
    for i in range(count):mesh.face(center,rings[0][i],rings[0][(i+1)%count])
    for inner,outer in zip(rings,rings[1:]):
        for i in range(count):
            j=(i+1)%count
            mesh.face(inner[i],outer[i],outer[j]);mesh.face(inner[i],outer[j],inner[j])


def trench_coat(mesh):
    start=len(mesh.positions)
    rows=((- .84,.45,.275,.45),(-.50,.415,.26,.43),(-.10,.365,.24,.40),
          (.40,.365,.24,.48),(.77,.41,.247,.60),(.94,.355,.21,.85))
    points,tints=[],[]
    for i in range(27):
        y=mix(rows[0][0],rows[-1][0],i/26)
        rx,rz,opening=profile(rows,y)
        for j in range(57):
            angle=mix(opening,2*PI-opening,j/56)
            # Subtle cloth folds, baked offline rather than simulated.
            fold=.006*math.cos(angle*9+y*5)*smooth(.7,-.7,y)
            points.append(((rx+fold)*math.sin(angle),y,(rz+fold)*math.cos(angle)))
            tints.append(color(COAT,.88+.12*(.5+.5*math.cos(angle))))
    mesh.grid(points,27,57,tints)
    lapel_z=lambda x,y:.263-.18*x*x+.012*(1-y)
    for side in (-1,1):
        outline=[(side*x,y) for x,y in [(.11,.985),(.255,.94),(.37,.755),
                 (.295,.69),(.33,.625),(.158,.37),(.19,.71)]]
        tailored_patch(mesh,outline,'#c7ae7f',lapel_z)
        for edge in ((2,3,4,5),(0,6,5)):
            seam(mesh,[(outline[i][0],outline[i][1],lapel_z(*outline[i])+.003) for i in edge],.006,'#6f6048')
        # Welt pockets and long front-edge stitching on the coat itself.
        pocket=[]
        for t in [i/12 for i in range(13)]:
            x,y=side*(.235+.07*t),.08+.06*t
            rx,rz,_=profile(rows,y)
            pocket.append((x,y,rz*math.sqrt(1-(x/rx)**2)+.006))
        seam(mesh,pocket,.009,'#77664b')
        edge=[]
        for i in range(21):
            y=mix(-.82,.37,i/20);rx,rz,opening=profile(rows,y)
            edge.append((side*(rx*math.sin(opening)+.006),y,rz*math.cos(opening)+.003))
        seam(mesh,edge,.005,'#7a694e')
    for y in (.24,-.15,-.56):
        rx,rz,opening=profile(rows,y)
        face_patch(mesh,-rx*math.sin(opening)-.035,y,.012,.019,DARK,z=rz*math.cos(opening)+.008)
    # Coat tails and lapels remain on Root when the arms move.
    mesh.rigid_vertices.update(range(start,len(mesh.positions)))


def hair_lock(mesh,control,width,tint):
    points,tints=[],[]
    def curve(t):
        return tuple((1-t)**3*control[0][k]+3*t*(1-t)**2*control[1][k]
                     +3*t*t*(1-t)*control[2][k]+t**3*control[3][k] for k in range(3))
    for i in range(12):
        t=i/11;p=curve(t)
        tangent=norm(sub(curve(min(1,t+.01)),curve(max(0,t-.01))))
        across=norm(cross(tangent,(0,0,1)));depth=norm(cross(across,tangent))
        w=width*(.55+.65*math.sin(PI*t))*(1-t)**.55+.0008
        for j in range(9):
            a=j/8*2*PI
            points.append(add(p,add(mul(across,math.cos(a)*w),mul(depth,math.sin(a)*w*.44))))
            tints.append(color(tint,.78+.22*(.5+.5*math.sin(a))))
    mesh.grid(points,12,9,tints)


def tousled_hair(mesh):
    # A continuous cap hides the scalp beneath layered, tapered, curved locks.
    points,tints=[],[]
    for i in range(19):
        for j in range(57):
            a=j/56*2*PI
            limit=1.30+.95*(1-math.cos(a))/2+.30*abs(math.sin(a))
            phi=.012+(limit-.012)*i/18
            ripple=1+.018*math.sin(a*9+phi*3)
            points.append((.305*math.sin(phi)*math.sin(a)*ripple,
                           1.59+.365*math.cos(phi),
                           -.025+.252*math.sin(phi)*math.cos(a)*ripple))
            tints.append(color(HAIR,.87+.13*math.sin(phi)))
    mesh.grid(points,19,57,tints)
    palette=['#302b2a','#3b3330','#433a34','#352f2d']
    # Shaggy sides and back: each point ends in a distinct swept silhouette.
    for i in range(18):
        a=.90+i/17*(2*PI-1.8);sx,sz=math.sin(a),math.cos(a)
        tip_y=1.22+.19*(.5+.5*math.sin(i*2.3))
        hair_lock(mesh,[(.18*sx,1.85,.14*sz-.025),(.32*sx,1.73,.255*sz-.025),
                        (.32*sx,1.42,.265*sz-.025),(.36*sx+.035*math.sin(i),tip_y,.26*sz-.025)],
                  .062,palette[i%4])
    # Asymmetric face-framing bangs; central tips dip between the smiling eyes.
    bangs=[(-.24,-.275,1.46),(-.17,-.205,1.59),(-.10,-.14,1.62),
           (-.025,-.015,1.455),(.055,.10,1.49),(.14,.185,1.605),(.22,.275,1.425)]
    for i,(root,tip,y) in enumerate(bangs):
        crown=1.99-.18*abs(root)/.24
        hair_lock(mesh,[(root*.65,crown,.10), (root,1.84,.235),
                        (tip-.025,1.68,.275), (tip,y,.235 if abs(tip)>.23 else .278)],
                  .068 if i in (2,3,4) else .054,palette[i%4])


def wrapped_sleeves(mesh):
    for side in (-1,1):
        for cy in (-.13,-.06,.01,.08,.15):
            points=[]
            for i in range(25):
                angle=i/24*2*PI;y=cy+.012*math.cos(angle)
                rx,rz,cz=profile(ARM,y);arm_x=.43+(.90-y)*.19
                for offset in (-.002,.002):
                    points.append((side*(arm_x+(rx+.007)*math.cos(angle)),y+offset,cz+(rz+.007)*math.sin(angle)))
            mesh.grid(points,25,2,[color('#a4afa8')]*len(points))
        # Rolled cuffs hide the material boundary and add a real folded edge.
        points=[];tints=[]
        for y,extra in ((.167,.003),(.174,.012),(.198,.013),(.225,.004)):
            rx,rz,cz=profile(ARM,y);arm_x=.43+(.90-y)*.19
            for i in range(25):
                a=i/24*2*PI
                points.append((side*(arm_x+(rx+extra)*math.cos(a)),y,cz+(rz+extra)*math.sin(a)))
                tints.append(color('#c1aa7e'))
        mesh.grid(points,4,25,tints)


def standing_collar(mesh):
    points=[]
    for y,rx,rz in ((.925,.18,.165),(.97,.165,.162),(1.035,.14,.145),(1.075,.128,.13)):
        for i in range(33):
            a=mix(.65,2*PI-.65,i/32)
            points.append((rx*math.sin(a),y,rz*math.cos(a)+.01))
    mesh.grid(points,4,33,[color(CREAM)]*len(points))
    # Join the raised neck to the shirt front, closing the gap below the collar.
    points=[]
    for i in range(6):
        t=i/5
        for j in range(13):
            x=mix(-.12,.12,j/12)*mix(.83,1,t)
            points.append((x,mix(1.047,.98,t),mix(.129,.239,t)-.25*x*x))
    mesh.grid(points,6,13,[color(CREAM)]*len(points))


def character_details(mesh):
    # A clean white shirt triangle avoids coarse vertex-color borders at the V.
    tailored_patch(mesh,[(-.115,.993),(.115,.993),(.126,.85),(0,.55),(-.126,.85)],
                   CREAM,lambda x,y:.239-.08*x*x)
    tailored_patch(mesh,[(-.21,.20),(.21,.20),(.20,-.075),(.07,-.13),
                        (0,-.02),(-.07,-.13),(-.20,-.075)],
                   '#272e29',lambda x,y:.195-.15*x*x)
    for side in (-1,1):
        # Closed crescent eyes, rather than the previous open realistic eyes.
        ribbon(mesh,[(side*(.063+.117*t),1.50+.024*math.sin(PI*t))
                     for t in [i/20 for i in range(21)]],.014,HAIR,depth=.004)
        ribbon(mesh,[(side*(.075+.095*t),1.568+.012*math.sin(PI*t))
                     for t in [i/16 for i in range(17)]],.008,'#584b3c')
        # Shirt collar points and dark ribbon surrounding the blue-green brooch.
        tailored_patch(mesh,[(side*.10,1.005),(side*.23,.91),(side*.20,.74),(side*.10,.85)],
                       '#edf0e8',lambda x,y:.25-.1*x*x)
        seam(mesh,[(side*.025,.65,.261),(side*.105,.72,.261),(side*.18,.80,.261)],.025,DARK)
    ribbon(mesh,[(0,1.443),(.009,1.421),(.018,1.415)],.005,'#ab8c70')
    face_patch(mesh,0,1.335,.105,.034,'#65413c',layer=1,bend=.016)
    face_patch(mesh,0,1.330,.090,.024,'#c57c84',layer=2,bend=.014)
    ribbon(mesh,[(-.076+.152*t,1.355+.005*abs(2*t-1)) for t in [i/20 for i in range(21)]],.012,'#fff3e2',depth=.016)
    # Neck wrap lines follow the sculpt around the neck, not flat image decals.
    for cy in (1.035,1.09,1.145):
        ribbon(mesh,[(-.085+.17*t,cy+.009*t) for t in [i/20 for i in range(21)]],.006,'#a9b5b0',depth=.003)
    for rx,ry,tint,layer in [(.052,.073,DARK,0),(.045,.065,'#c1aa54',1),
                            (.033,.052,'#186b73',2),(.022,.041,'#25949a',3)]:
        face_patch(mesh,0,.652,rx,ry,tint,z=.243,layer=layer)
    face_patch(mesh,-.011,.674,.008,.022,'#b2ded1',z=.260)
    # The white tie tip below the brooch rests over the dark waistcoat.
    tailored_patch(mesh,[(-.025,.574),(.025,.574),(.04,.49),(0,.45),(-.04,.49)],
                   CREAM,lambda x,y:front_z(x,y)+.012)
    trench_coat(mesh)
    tousled_hair(mesh)
    wrapped_sleeves(mesh)
    standing_collar(mesh)


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
        normals=mesh.normals()
        # Hair, lapels and jewelry use their own curved-surface normals. Only
        # the implicit body uses field gradients to smooth the sampled surface.
        for i,(x,y,z) in enumerate(mesh.positions[:mesh.sculpt_count]):
            normals[i]=norm((sculpt(x+.002,y,z)-sculpt(x-.002,y,z),sculpt(x,y+.002,z)-sculpt(x,y-.002,z),sculpt(x,y,z+.002)-sculpt(x,y,z-.002)))
        attrs={'POSITION':self.accessor(mesh.positions,bounds=True),'NORMAL':self.accessor(normals),'COLOR_0':self.accessor([tuple(round(clamp(c)*255) for c in tint) for tint in mesh.colors],component=5121)}
        self.doc['accessors'][attrs['COLOR_0']]['normalized']=True
        if skin:
            joints,weights=zip(*(((0,0,0,0),(1,0,0,0)) if i in mesh.rigid_vertices else joint_weights(p)
                                 for i,p in enumerate(mesh.positions)))
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
    glb=GLB();mat=glb.material('Painted anime hair, cotton and gabardine',1,True)
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
    node=glb.node(name='SculptedCharacter',mesh=glb.mesh('Anime portrait, trench coat and sculpted hair',model,mat,True),skin=0)
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
