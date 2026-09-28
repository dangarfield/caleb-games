/* rooms.js — Buttons! room data and the clue generator.
 * Ported from the Claude Design prototype (research/New game design overview/Buttons 3D.dc.html).
 * Pure data + logic: no DOM, no three.js, so node can import it (tests/clues.mjs).
 *   ROOMS      10 room layouts (models per wall, dims, wall/floor patterns)
 *   layoutRoom derives landmark rects, drawer interiors and the door from the model bounds table
 *   genRoom    builds one round: buttons, the target, clues (exactly one match), clue things
 */
const G_COLORS=['red','orange','yellow','green','blue','purple','pink','white','black'];
const G_HEX={red:'#F2424F',orange:'#FF8A2A',yellow:'#FFD23A',green:'#45C46A',blue:'#3C8CF0',purple:'#9A5BE0',pink:'#FF7FC0',white:'#F7F4EE',black:'#3A3442'};
const G_SHAPES=['circle','square','triangle','star','heart','hexagon','cloud','arrow'];
const G_PICS=['sun','fish','skull','crown','lightning'];
const SH_TXT={circle:'a circle',square:'a square',triangle:'a triangle',star:'a star',heart:'a heart',hexagon:'a hexagon',cloud:'a cloud',arrow:'an arrow'};
const PIC_TXT={sun:'a sun',fish:'a fish',skull:'a skull',crown:'a crown',lightning:'a lightning bolt'};
const RID_C={red:'a strawberry',orange:'a carrot',yellow:'a banana',green:'a frog',blue:'the sky',purple:'a grape',pink:'a flamingo',white:'snow',black:'the night'};
const RID_S={circle:'I have no corners',cloud:'I have no corners',triangle:'I have 3 corners',square:'I have 4 corners',hexagon:'I have 6 corners',star:'I have 5 points',heart:'I am the shape of love',arrow:'I point the way'};
const FIN_TXT={glowing:'glowing',stripy:'stripy',spotty:'spotty',rubbery:'squishy rubber',shiny:'shiny'};
const BSIZE={tiny:26,normal:38,big:50,giant:112};
const WALLDIM={back:[1000,560],left:[520,560],right:[520,560],floor:[1000,520]};
const DOOR={x:850,y:290,w:120,h:270};
const THING_SAY={note:'A note! Bip scans it…',parrot:'SQUAWK! The parrot knows a clue!',tv:'Bzzzt! The TV flickers on…',cookie:'Crack! A fortune cookie!',bottle:'Pop! A message in a bottle!'};
const CAPW=s=>s[0].toUpperCase()+s.slice(1);
const BOUNDS={'furniture/armchair_pillows':[-.9,0,-.75,.9,1.22,.85],'furniture/bed_single_A':[-.8,0,-1.5,.8,1,1.5],'furniture/bed_single_B':[-.8,0,-1.5,.8,1,1.5],'furniture/book_set':[-.39,-.25,-.18,.39,.25,.19],'furniture/cabinet_medium':[-1,0,-.5,1,1,.5],'furniture/cabinet_small':[-.5,0,-.5,.5,1,.5],'furniture/chair_A':[-.38,0,-.47,.38,1.26,.37],'furniture/lamp_standing':[-.5,0,-.5,.5,2.52,.5],'furniture/lamp_table':[-.5,0,-.5,.5,1.02,.5],'furniture/pictureframe_large_A':[-.5,-.6,0,.51,.6,.2],'furniture/pictureframe_large_B':[-1,-.6,0,1,.6,.2],'furniture/pictureframe_small_A':[-.25,-.3,0,.25,.3,.2],'furniture/pillow_A':[-.33,-.1,-.25,.32,.1,.25],'furniture/rug_oval_A':[-1.5,0,-1,1.5,.1,1],'furniture/rug_oval_B':[-1.5,0,-1,1.5,.1,1],'furniture/rug_rectangle_stripes_A':[-1.5,0,-1,1.5,.1,1],'furniture/shelf_A_big':[-1,-.3,0,1,.1,.5],'furniture/shelf_B_large':[-1,-.1,0,1,.3,.5],'furniture/shelf_B_large_decorated':[-1,-.1,0,1,.72,.5],'furniture/table_medium_long':[-1.5,0,-1,1.5,1,1],
'restaurant/bowl':[-.47,0,-.48,.48,.3,.48],'restaurant/chair_stool':[-.37,0,-.38,.38,.5,.38],'restaurant/crate_cheese':[-1,0,-1,1,.95,1],'restaurant/crate_tomatoes':[-1,0,-1,1,.92,1],'restaurant/dishrack_plates':[-.6,0,-.6,.6,1.1,.6],'restaurant/door_A':[0,0,-.39,1.6,2.8,.39],'restaurant/extractorhood':[-1,2,0,1,4,1.61],'restaurant/fridge_A':[-1,0,-1,1,2.5,1.24],'restaurant/fridge_B':[-1,0,-1,1,2.5,1.24],'restaurant/jar_A_medium':[-.25,0,-.25,.25,.65,.25],'restaurant/jar_B_medium':[-.25,0,-.25,.25,.65,.25],'restaurant/jar_C_medium':[-.25,0,-.25,.25,.65,.25],'restaurant/kitchencabinet':[-1,2,0,1,4,1.04],'restaurant/kitchencounter_sink':[-1,0,-1,1,1.8,1.04],'restaurant/kitchencounter_straight_A':[-1,0,-1,1,1,1.04],'restaurant/kitchencounter_straight_B':[-1,0,-1,1,1,1.04],'restaurant/kitchentable_A_large':[-1.5,0,-1,1.5,1,1],'restaurant/menu':[-.25,0,-.15,.25,.8,.15],'restaurant/oven':[-1,0,-1.03,1,2.02,1.32],'restaurant/pan_A':[-.5,0,-.5,.5,.25,1],'restaurant/pot_A':[-.7,0,-.5,.7,.5,.5],'restaurant/shelf_papertowel_decorated':[-1,-.91,0,1,.8,.63],'restaurant/stove_multi':[-1,0,-1.03,1,1.2,1.26],'restaurant/table_round_A_small':[-.75,0,-.75,.75,1,.75],
'halloween/bone_A':[-.35,-.14,-.1,.35,.14,.1],'halloween/candle_triple':[-.15,0,-.14,.3,.79,.21],'halloween/coffin':[-1,0,-1.5,1,1.32,1.5],'halloween/coffin_decorated':[-1,0,-1.5,1,.9,1.5],'halloween/gravestone':[-.7,0,-.2,.7,1.6,.2],'halloween/lantern_hanging':[-.32,-1.31,-.32,.32,.1,.32],'halloween/lantern_standing':[-.32,0,-.32,.32,.93,.32],'halloween/plaque_candles':[-1,0,-1,1,1.13,1],'halloween/pumpkin_orange_jackolantern':[-.75,0,-.7,.75,1.3,.7],'halloween/pumpkin_orange_small':[-.3,0,-.3,.3,.55,.3],'halloween/pumpkin_yellow':[-.5,0,-.5,.5,.7,.5],'halloween/shrine_candles':[-.55,0,-.55,.55,1.79,.55],'halloween/skull':[-.46,.02,-.46,.46,.92,.45],
'prototype/Barrel_A':[-.5,-.5,-.5,.5,.5,.5],'prototype/Box_A':[-.23,0,-.23,.23,.51,.24],'prototype/Box_B':[-.3,0,-.2,.3,.4,.21],'prototype/Can_A':[-.15,0,-.15,.15,.48,.15],'prototype/Cube_Prototype_Large_A':[-2,0,-2,2,4,2],'prototype/Cube_Prototype_Small':[-1,0,-1,1,2,1],'prototype/Door_A':[0,0,-.27,1.6,2.8,.27],'prototype/Door_B':[0,0,-.15,1.6,2.8,.39],'prototype/Pallet_Large':[-2,0,-2,2,.5,2],'prototype/Pallet_Small_Decorated_A':[-1,0,-1,1,1.5,1],'prototype/table_medium_Decorated':[-1,0,-.75,1,1.71,.75],'prototype/table_medium_long':[-1.5,0,-.75,1.5,1,.75],'prototype/target_wall_large_A':[-1,-1,-.1,1,1,.1],
'space/cargo_A_stacked':[-.51,0,-.51,.51,1.01,.51],'space/cargo_B':[-.25,0,-.26,.25,.52,.26],'space/containers_A':[-.25,0,-.25,.25,.2,.25],'space/containers_B':[-.25,0,-.25,.25,.2,.25],'space/lights':[-.34,0,-.34,.34,1,.34],'space/solarpanel':[-.45,0,-.23,.45,.37,.22],'space/structure_low':[-.88,0,-.88,.88,1,.88],
'dungeon/banner_patternA_red':[-.75,.53,.38,.75,3.73,.69],'dungeon/banner_triple_blue':[-1.85,.53,.35,1.85,3.73,.72],'dungeon/barrel_large':[-.9,0,-.9,.9,2,.9],'dungeon/barrel_small_stack':[-.93,0,-.5,.93,1.77,.5],'dungeon/bottle_A_green':[-.18,0,-.18,.18,.89,.18],'dungeon/bottle_B_brown':[-.28,0,-.28,.28,.89,.28],'dungeon/box_large':[-.75,0,-.75,.75,1.5,.75],'dungeon/candle_lit':[-.17,0,-.17,.17,1.05,.16],'dungeon/candle_triple':[-.17,0,-.16,.33,.87,.23],'dungeon/chair':[-.37,0,-.38,.38,1.23,.38],'dungeon/chest':[-.85,0,-.7,.85,1.3,.75],'dungeon/chest_gold':[-.85,0,-.7,.85,1.3,.75],'dungeon/coin_stack_large':[-.72,0,-.82,.72,1.16,.84],'dungeon/column':[-.35,0,-.35,.35,1.4,.35],'dungeon/crates_stacked':[-1.09,0,-1.16,1,2.14,1.09],'dungeon/keyring_hanging':[-.34,-1.2,-.16,.34,.02,.22],'dungeon/shelf_large':[-1,-.35,0,1,.1,.5],'dungeon/shelves':[-1,.75,.25,1,2.7,.75],'dungeon/sword_shield':[-1.12,-.82,-.08,1.12,.85,.25],'dungeon/table_medium_decorated_A':[-1,0,-1,1,1.89,1],'dungeon/torch_mounted':[-.28,-.38,0,.28,.68,.62],'dungeon/trunk_large_A':[-.75,0,-.65,.75,1,.65],'dungeon/trunk_medium_A':[-.48,0,-.44,.48,.73,.44]};
const OPENS={'restaurant/fridge_A':[{node:'fridge_A_door_top',axis:'y',amt:1.3,r:[-1,1.5,1,2.5],dz:.5},{node:'fridge_A_door_bottom',axis:'y',amt:1.3,r:[-1,0,1,1.5],dz:.5}],'restaurant/fridge_B':[{node:'fridge_B_door',axis:'y',amt:1.3,r:[-1,0,1,2.5],dz:.5}],'restaurant/oven':[{node:'oven_door',axis:'x',amt:1.35,r:[-.9,.4,.4,1.6],dz:.9}],'dungeon/chest':[{node:'chest_lid',axis:'x',amt:-1.8,r:[-.7,-.5,.7,.55],dz:.52}],'dungeon/chest_gold':[{node:'chest_gold_lid',axis:'x',amt:-1.8,r:[-.7,-.5,.7,.55],dz:.52}],'halloween/coffin':[{node:'coffin_lid',axis:'slide',amt:1.7,r:[-.8,-1.3,.8,1.3],dz:.7}]};
function primBounds(p){const w=p.w||1,h=p.h||1,d=p.d||.6,s=p.sc||1;switch(p.type){case 'window':return [-w/2-.15,-.18,0,w/2+.15,h+.16,.36];case 'screen':return [-w/2,0,0,w/2,h,.13];case 'lever':return [-.4*s,0,0,.4*s,.9*s,.14*s];case 'globe':return [-.5,0,-.5,.5,1.6,.5];case 'post':return [-.08,0,-.08,.08,h,.08];default:return [-w/2,0,0,w/2,h,d];}}
const M=(m,wall,wx,o)=>Object.assign({m,wall,wx},o||{});
const P=(type,wall,wx,o)=>{o=Object.assign({},o||{});const prim={type,w:o.w,h:o.h,d:o.d,sc:o.sc,color:o.color};['w','h','d','sc','color'].forEach(k=>delete o[k]);return Object.assign({prim,wall,wx},o);};
const DOORM=(m,wx)=>M(m,'back',wx,{off:.4,door:true});
function layoutRoom(R){if(R._lay)return R._lay;const H=R.dims.back[1],Dp=R.dims.left[0],Wp=R.dims.back[0];const lms=[],drs=[],wins=[];let door=null;
  R.models.forEach((md,mi)=>{md.name=md.name||('m'+mi);const pb=md.prim?primBounds(md.prim):BOUNDS[md.m];if(!pb){console.warn('no bounds',md.m);return;}
    const s=md.s||1,base=md.base||0,off=md.off||0,lmN=md.lm?md.lm[0]:null,lmC=md.lm?md.lm[1]:'#ccc';
    const fp=(x0,z0,x1,z1)=>{const r=md.rot||0,c=Math.cos(r),sn=Math.sin(r);const Q=[[x0,z0],[x1,z0],[x0,z1],[x1,z1]].map(([x,z])=>[(x*c+z*sn)*s*100,(-x*sn+z*c)*s*100]);const xs=Q.map(q=>q[0]),zs=Q.map(q=>q[1]);return {x:md.wx+Math.min(...xs),y:(md.wy||0)+Math.min(...zs),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...zs)-Math.min(...zs)};};
    const wr=(x0,y0,x1,y1)=>({x:md.wx+x0*s*100,y:H-(base+y1*s)*100,w:(x1-x0)*s*100,h:(y1-y0)*s*100});
    let rect,depth;
    if(md.wall==='floor'){rect=fp(pb[0],pb[2],pb[3],pb[5]);depth=base+pb[4]*s;}else{rect=wr(pb[0],pb[1],pb[3],pb[4]);depth=off+pb[5]*s;}
    if(md.door){door=rect;return;}
    if(md.prim&&md.prim.type==='window')wins.push({x:md.wx-md.prim.w*50,y:H-(base+md.prim.h)*100,w:md.prim.w*100,h:md.prim.h*100});
    if(md.noBlock&&md.wall==='floor'&&pb[4]*s<.2)lms.push(Object.assign({id:'m'+mi,mi,name:null,color:'#ccc',wall:'floor',depth,noOn:false,anon:true},rect));
    if(!md.noBlock){const flat=md.wall==='floor'&&pb[4]*s<.2;const hold=(md.wall!=='floor'||flat)&&!!md.lm&&md.hold!==false;
      lms.push(Object.assign({id:'m'+mi,mi,name:lmN,color:lmC,wall:md.wall,depth,noOn:!hold,anon:!md.lm},rect));
      if(md.move){const am=md.move.amp*100;lms.push({id:'m'+mi+'s',mi,name:null,wall:md.wall,x:rect.x-am,y:rect.y,w:rect.w+2*am,h:rect.h,depth,noOn:true,anon:true});}
      if(md.wall!=='floor'&&base<.4&&!(md.prim&&md.prim.type==='window')){const fd=depth*100+20;
        if(md.wall==='back')lms.push({id:'m'+mi+'f',name:null,wall:'floor',x:rect.x-10,y:0,w:rect.w+20,h:fd,noOn:true,anon:true});
        if(md.wall==='left')lms.push({id:'m'+mi+'f',name:null,wall:'floor',x:0,y:Dp-rect.x-rect.w-10,w:fd,h:rect.w+20,noOn:true,anon:true});
        if(md.wall==='right')lms.push({id:'m'+mi+'f',name:null,wall:'floor',x:Wp-fd,y:rect.x-10,w:fd,h:rect.w+20,noOn:true,anon:true});}
      if(md.wall==='floor'){const ht=depth*100,e=45;
        if(rect.y<e)lms.push({id:'m'+mi+'b',name:null,wall:'back',x:rect.x,y:H-ht,w:rect.w,h:ht,noOn:true,anon:true});
        if(rect.x<e)lms.push({id:'m'+mi+'l',name:null,wall:'left',x:Dp-rect.y-rect.h,y:H-ht,w:rect.h,h:ht,noOn:true,anon:true});
        if(rect.x+rect.w>Wp-e)lms.push({id:'m'+mi+'r',name:null,wall:'right',x:rect.y,y:H-ht,w:rect.h,h:ht,noOn:true,anon:true});}}
    const ops=md.prim&&md.prim.type==='cupboard'?[{node:'door',axis:'y',amt:-1.75,r:[-md.prim.w/2+.06,.06,md.prim.w/2-.06,md.prim.h-.06],dz:.07}]:(OPENS[md.m]||[]);
    if(md.opens)ops.forEach((o,k)=>{if(!md.opens[k])return;const rr=md.wall==='floor'?fp(o.r[0],o.r[1],o.r[2],o.r[3]):wr(o.r[0],o.r[1],o.r[2],o.r[3]);
      drs.push(Object.assign({id:'o'+mi+'_'+k,name:md.opens[k],wall:md.wall,color:lmC,dz:(md.wall==='floor'?base:off)+o.dz*s,node:md.name+':'+o.node,axis:o.axis,amt:o.amt,mi},rr));});
  });
  return R._lay={lms,drs,door,wins};}
const DIMS=(W,H,D)=>({back:[W,H],left:[D,H],right:[D,H],floor:[W,D]});
const ROOMS=[
{name:'Ticket Booth',count:30,gl:true,dims:DIMS(900,480,540),wall:['stripes','#FFE7BF','#FFD9A0'],floor:['planks','#E3B684','#CC9A66'],ceil:'#FFF1D8',slab:'#C98D5B',door:'#F2424F',bd:'radial-gradient(circle at 40% 40%,#FFF3DA,#F2CF98)',models:[
 M('restaurant/kitchencounter_straight_A','back',150,{off:1,lm:['the ticket counter','#E86A5A']}),M('restaurant/kitchencounter_straight_B','back',350,{off:1,lm:['the ticket counter','#E86A5A']}),
 M('prototype/Box_B','back',120,{off:1.3,base:1}),M('restaurant/menu','back',330,{off:1.4,base:1}),
 M('furniture/pictureframe_large_B','back',300,{base:3.2,lm:['the map board','#7FC8F8']}),DOORM('restaurant/door_A',620),
 M('furniture/cabinet_medium','left',300,{off:.5,lm:['the ticket cupboard','#FFB547']}),M('furniture/lamp_standing','left',470,{off:.6}),M('furniture/pictureframe_small_A','left',300,{base:2.8,lm:['the little picture','#9BD86A']}),
 M('furniture/shelf_B_large_decorated','right',260,{base:2.4,lm:['the ticket shelf','#FFC93C']}),M('furniture/cabinet_small','right',120,{off:.5,lm:['the little cabinet','#C98D5B']}),
 M('furniture/rug_rectangle_stripes_A','floor',450,{wy:340,lm:['the stripy rug','#F2424F']}),M('restaurant/chair_stool','floor',260,{wy:420,lm:['the stool','#FF8FB8']})]},
{name:'Ice Cream Parlour',count:48,gl:true,dims:DIMS(1000,500,600),wall:['stripes','#FFE0EC','#FFF8FB'],floor:['checker','#FFB3CF','#FFF6FA'],ceil:'#FFF0F6',slab:'#E58FB0',door:'#7FC8F8',bd:'radial-gradient(circle at 40% 40%,#FFF4F9,#F7C3D8)',models:[
 M('restaurant/kitchencounter_straight_A','back',140,{off:1,lm:['the freezer counter','#8FE0E6']}),M('restaurant/kitchencounter_straight_B','back',340,{off:1,lm:['the freezer counter','#8FE0E6']}),M('restaurant/kitchencounter_straight_A','back',540,{off:1,lm:['the freezer counter','#8FE0E6']}),
 M('restaurant/kitchencabinet','back',540,{lm:['the ice cream cupboard','#FFB3CF']}),M('furniture/shelf_A_big','back',200,{base:3.3}),
 M('restaurant/jar_A_medium','back',135,{base:3.4,off:.25}),M('restaurant/jar_B_medium','back',200,{base:3.4,off:.25}),M('restaurant/jar_C_medium','back',265,{base:3.4,off:.25}),
 M('restaurant/bowl','back',90,{base:1,off:1.3,s:.55}),M('restaurant/menu','back',600,{base:1,off:1.4}),DOORM('restaurant/door_A',790),
 M('restaurant/fridge_A','left',180,{off:1,lm:['the freezers','#CFEFFF'],opens:['the top freezer door','the bottom freezer door']}),M('restaurant/fridge_B','left',420,{off:1,lm:['the freezers','#CFEFFF'],opens:['the tall freezer door']}),
 M('restaurant/kitchencounter_straight_B','right',200,{off:1,lm:['the sundae counter','#FFC0DA']}),M('restaurant/kitchencounter_straight_A','right',400,{off:1,lm:['the sundae counter','#FFC0DA']}),
 M('restaurant/jar_B_medium','right',160,{base:1,off:1.1}),M('restaurant/jar_C_medium','right',240,{base:1,off:1.1}),M('restaurant/bowl','right',420,{base:1,off:1.2,s:.55}),
 M('furniture/pictureframe_large_A','right',300,{base:3,lm:['the picture','#7FC8F8']}),
 M('furniture/rug_oval_A','floor',520,{wy:390,lm:['the rug','#FF9FC6']}),M('restaurant/chair_stool','floor',640,{wy:520,lm:['the stools','#FF8FB8']}),M('restaurant/chair_stool','floor',740,{wy:520,lm:['the stools','#FF8FB8']})]},
{name:'Toy Bedroom',count:66,gl:true,dims:DIMS(1000,500,600),wall:['dots','#CFE6FF','#E6F2FF'],floor:['planks','#F0CFA0','#D9B27F'],ceil:'#E8F3FF',slab:'#B98A5A',door:'#FFB547',bd:'radial-gradient(circle at 40% 40%,#EEF6FF,#B9D8F7)',ground:'#B9D8F7',models:[
 M('furniture/cabinet_medium','back',330,{off:.5,lm:['the toy cupboard','#FF8FB8']}),M('furniture/lamp_table','back',260,{base:1,off:.5}),M('furniture/shelf_B_large_decorated','back',330,{base:3,lm:['the high shelf','#FFC93C']}),
 M('furniture/pictureframe_small_A','back',590,{base:3.2,lm:['the little picture','#9BD86A']}),DOORM('restaurant/door_A',790),
 M('furniture/shelf_B_large_decorated','right',300,{base:1.4,lm:['the bookshelf','#C98A5A']}),M('furniture/shelf_B_large_decorated','right',300,{base:2.6,lm:['the bookshelf','#C98A5A']}),
 P('cupboard','right',520,{w:1,h:1.2,d:.8,color:'#FFB547',lm:['the bedside cupboard','#FFB547'],opens:['the bedside cupboard']}),
 M('furniture/pictureframe_large_A','left',260,{base:3,lm:['the big picture','#7FC8F8']}),
 M('furniture/bed_single_A','floor',160,{wy:150,lm:['the bunk bed','#8C6BD9']}),M('furniture/bed_single_B','floor',160,{wy:150,base:1.4,noBlock:true}),
 P('post','floor',86,{wy:6,h:2.5,color:'#C98A5A',noBlock:true}),P('post','floor',234,{wy:6,h:2.5,color:'#C98A5A',noBlock:true}),P('post','floor',86,{wy:294,h:2.5,color:'#C98A5A',noBlock:true}),P('post','floor',234,{wy:294,h:2.5,color:'#C98A5A',noBlock:true}),
 M('dungeon/chest','floor',560,{wy:110,lm:['the toy box','#FFB547'],opens:['the toy box']}),
 M('furniture/rug_oval_B','floor',560,{wy:400,lm:['the rug','#FF9FC6']}),M('furniture/armchair_pillows','floor',840,{wy:440,rot:-.6,lm:['the armchair','#7FC8F8']}),M('furniture/pillow_A','floor',500,{wy:420,base:.1})]},
{name:'Pizza Kitchen',count:90,gl:true,dims:DIMS(1100,520,640),wall:['tiles','#FFF3DC','#EBD5AA'],floor:['checker','#E9564B','#FFF3E6'],ceil:'#FFF6E6',slab:'#B8574A',door:'#45C46A',bd:'radial-gradient(circle at 40% 40%,#FFF6E6,#F2C9A0)',ground:'#F2C9A0',models:[
 M('restaurant/oven','back',230,{off:1.03,lm:['the pizza oven','#D9745A'],opens:['the oven']}),M('restaurant/extractorhood','back',230,{lm:['the chimney hood','#C9C0D9']}),
 M('restaurant/stove_multi','back',450,{off:1.03,lm:['the stove','#9AA7B8']}),M('restaurant/pan_A','back',410,{base:1.2,off:1}),M('restaurant/pot_A','back',500,{base:1.2,off:1.1}),
 M('restaurant/kitchencounter_sink','back',660,{off:1,lm:['the sink','#8FE0E6']}),M('restaurant/shelf_papertowel_decorated','back',660,{base:3.3}),DOORM('restaurant/door_A',880),
 M('restaurant/fridge_B','left',520,{off:1,lm:['the fridge','#E8EEF5'],opens:['the fridge']}),
 M('restaurant/kitchencounter_straight_A','left',310,{off:1,lm:['the side counter','#F3D9A4']}),M('restaurant/kitchencounter_straight_B','left',110,{off:1,lm:['the side counter','#F3D9A4']}),M('restaurant/dishrack_plates','left',210,{base:1,off:1}),
 M('furniture/shelf_B_large','right',330,{base:2.2,lm:['the pan shelf','#C98A5A']}),M('furniture/shelf_B_large','right',330,{base:3.3,lm:['the pan shelf','#C98A5A']}),M('restaurant/pan_A','right',290,{base:2.3,off:.05,s:.6}),M('restaurant/pot_A','right',380,{base:3.4,off:.1,s:.6}),
 M('restaurant/crate_tomatoes','right',140,{off:.6,s:.6,lm:['the crates','#E9564B']}),M('restaurant/crate_cheese','right',140,{off:.6,s:.6,base:.57,lm:['the crates','#E9564B']}),
 M('restaurant/kitchentable_A_large','floor',560,{wy:360,lm:['the dough table','#F3D9A4']}),M('restaurant/chair_stool','floor',820,{wy:540})]},
{name:'Pirate Treasure Hold',count:108,gl:true,dims:DIMS(1100,520,640),wall:['planks','#C99A6B','#A87A4E'],floor:['planks','#9C6B45','#7E5334'],ceil:'#8A5E3C',slab:'#6E4526',door:'#3C8CF0',bd:'radial-gradient(circle at 40% 40%,#F2D6AE,#B98655)',ground:'#B98655',fill:'#FFD9A0',models:[
 M('dungeon/shelves','back',300,{off:-.25,lm:['the shelves','#A8683E']}),M('dungeon/torch_mounted','back',130,{base:2.7}),M('dungeon/torch_mounted','back',730,{base:2.7}),
 M('dungeon/sword_shield','back',560,{base:3.3,lm:['the sword and shield','#C9C0D9']}),M('dungeon/keyring_hanging','back',450,{base:4.3}),DOORM('restaurant/door_A',880),
 M('halloween/lantern_hanging','back',560,{base:5.15,off:2.4,noBlock:true}),
 M('dungeon/barrel_small_stack','left',160,{off:.5,lm:['the barrels','#A8683E']}),M('dungeon/barrel_large','left',430,{off:.9,lm:['the barrels','#A8683E']}),
 M('dungeon/crates_stacked','right',180,{off:1.1,lm:['the crates','#D2A56A']}),M('dungeon/box_large','right',440,{off:.75,lm:['the crates','#D2A56A']}),
 M('dungeon/chest','floor',450,{wy:330,lm:['the treasure chest','#E0A33A'],opens:['the treasure chest']}),M('dungeon/chest_gold','floor',720,{wy:300,lm:['the gold chest','#FFD65C'],opens:['the gold chest']}),
 M('dungeon/coin_stack_large','floor',300,{wy:480,lm:['the gold coins','#FFD23A']}),M('dungeon/trunk_medium_A','floor',900,{wy:480})]},
{name:'Spooky Crypt',count:132,gl:true,dims:DIMS(1200,540,660),wall:['stones','#6E5A9E','#7E6AAF'],floor:['checker','#4F4278','#5C4E88'],ceil:'#4A3D70',slab:'#3A2F5C',door:'#9BD86A',bd:'radial-gradient(circle at 40% 40%,#9C88C9,#4A3D70)',ground:'#6E5A9E',fill:'#C4F08E',models:[
 M('halloween/gravestone','back',200,{off:.2,lm:['the gravestones','#9C88C9']}),M('halloween/gravestone','back',430,{off:.2,lm:['the gravestones','#9C88C9']}),
 M('dungeon/torch_mounted','back',315,{base:2.9}),M('dungeon/torch_mounted','back',640,{base:2.9}),
 P('cupboard','back',790,{w:1.2,h:1.8,d:.8,color:'#7A5AAE',lm:['the secret cupboard','#7A5AAE'],opens:['the secret cupboard']}),M('halloween/candle_triple','back',780,{base:1.8,off:.3}),DOORM('restaurant/door_A',960),
 M('dungeon/shelf_large','left',330,{base:1.6,lm:['the skull shelf','#8A7AAE']}),M('dungeon/shelf_large','left',330,{base:2.8,lm:['the skull shelf','#8A7AAE']}),
 M('halloween/skull','left',290,{base:1.62,off:.25,s:.42}),M('halloween/skull','left',380,{base:2.82,off:.25,s:.42}),M('dungeon/candle_triple','left',400,{base:1.62,off:.2}),
 M('halloween/plaque_candles','right',300,{off:1,lm:['the candle table','#FFD65C']}),M('halloween/lantern_standing','right',540,{off:.4}),
 M('halloween/coffin','floor',260,{wy:380,lm:['the coffin','#9C7BC9'],opens:['the coffin']}),M('halloween/coffin_decorated','floor',560,{wy:210,rot:1.5708,lm:['the big coffin','#7A5AAE']}),
 M('halloween/pumpkin_orange_jackolantern','floor',820,{wy:430,lm:['the pumpkins','#FF9A3C']}),M('halloween/pumpkin_yellow','floor',990,{wy:350,lm:['the pumpkins','#FF9A3C']}),
 M('halloween/pumpkin_orange_small','floor',700,{wy:560}),M('halloween/pumpkin_orange_small','floor',1080,{wy:540}),
 M('halloween/shrine_candles','floor',120,{wy:90,lm:['the shrine','#E6E1F2']}),M('halloween/bone_A','floor',580,{wy:580,base:.12})]},
{name:"Wizard's Study",count:156,gl:true,dims:DIMS(1200,560,680),wall:['stars','#3F4C8A','#FFE58A'],floor:['checker','#6B4C9A','#7D5CAE'],ceil:'#343F75',slab:'#2A3263',door:'#E4506A',bd:'radial-gradient(circle at 40% 40%,#7C88C8,#2A3263)',ground:'#6B4C9A',fill:'#CFAEF7',models:[
 M('dungeon/shelves','left',220,{off:-.25,lm:['the bookcases','#9C6A45']}),M('dungeon/shelves','left',220,{off:-.25,base:2,lm:['the bookcases','#9C6A45']}),M('dungeon/shelves','left',460,{off:-.25,lm:['the bookcases','#9C6A45']}),M('dungeon/shelves','left',460,{off:-.25,base:2,lm:['the bookcases','#9C6A45']}),
 M('dungeon/banner_triple_blue','back',470,{off:-.35,base:.6,lm:['the big banner','#3C8CF0']}),M('dungeon/banner_patternA_red','back',800,{off:-.38,base:.6,lm:['the red banner','#E4506A']}),
 P('cupboard','back',150,{w:1.2,h:2.2,d:.8,color:'#7A4E30',lm:['the spell cupboard','#7A4E30'],opens:['the spell cupboard']}),M('dungeon/candle_lit','back',150,{base:2.2,off:.3}),DOORM('restaurant/door_A',980),
 M('dungeon/shelf_large','right',350,{base:1.6,lm:['the potion shelf','#5AB89A']}),M('dungeon/shelf_large','right',350,{base:2.8,lm:['the potion shelf','#5AB89A']}),
 M('dungeon/bottle_A_green','right',300,{base:1.62,off:.25,s:.6}),M('dungeon/bottle_B_brown','right',400,{base:1.62,off:.25,s:.6}),M('dungeon/bottle_A_green','right',360,{base:2.82,off:.25,s:.6}),
 P('cupboard','right',590,{w:1,h:1.2,d:.7,color:'#5A4890',lm:['the potion cupboard','#5A4890'],opens:['the potion cupboard']}),
 M('dungeon/table_medium_decorated_A','floor',620,{wy:340,lm:['the potion table','#7BD6B8']}),M('dungeon/trunk_large_A','floor',320,{wy:520,lm:['the trunk','#A8683E']}),
 M('dungeon/chair','floor',780,{wy:340,rot:-1.57}),P('globe','floor',960,{wy:480,lm:['the globe','#6CB8F0']}),M('furniture/rug_oval_B','floor',620,{wy:560,noBlock:true})]},
{name:"Inventor's Workshop",count:180,gl:true,dims:DIMS(1300,560,700),wall:['pegboard','#BFD7C9','#9FBBAB'],floor:['tiles','#8E9AA6','#7A8591'],ceil:'#A9C2B4',slab:'#5E6B78',door:'#FF8A2A',bd:'radial-gradient(circle at 40% 40%,#E3F0E8,#8FAE9C)',ground:'#8FAE9C',models:[
 M('prototype/table_medium_long','back',300,{off:.75,lm:['the workbench','#E9B35A'],hold:false}),M('prototype/Box_A','back',220,{base:1,off:.7}),M('prototype/Can_A','back',330,{base:1,off:.8}),M('prototype/Box_B','back',400,{base:1,off:.6}),
 P('box','back',560,{w:2,h:.55,d:.6,base:1.9,color:'#FFC93C',move:{amp:1.2,speed:.6},lm:['the moving platform','#FFC93C']}),
 M('prototype/target_wall_large_A','back',800,{base:3.5,off:.1,lm:['the target board','#F26B5B']}),DOORM('prototype/Door_A',1080),
 P('cupboard','left',300,{w:1.1,h:2.6,d:.7,color:'#5DA3D9',lm:['the lockers','#5DA3D9'],opens:['the first locker']}),P('cupboard','left',420,{w:1.1,h:2.6,d:.7,color:'#5DA3D9',lm:['the lockers','#5DA3D9'],opens:['the middle locker']}),P('cupboard','left',540,{w:1.1,h:2.6,d:.7,color:'#5DA3D9',lm:['the lockers','#5DA3D9'],opens:['the end locker']}),
 P('lever','right',150,{base:1.4,color:'#F26B5B',lm:['the levers','#F26B5B']}),P('lever','right',240,{base:1.4,color:'#45C46A',lm:['the levers','#F26B5B']}),P('lever','right',330,{base:1.4,color:'#3C8CF0',lm:['the levers','#F26B5B']}),
 M('prototype/Cube_Prototype_Small','right',540,{off:.6,s:.6,lm:['the blocks','#9BD86A']}),M('prototype/Cube_Prototype_Small','right',540,{off:.45,base:1.2,s:.45,lm:['the blocks','#9BD86A']}),
 M('prototype/Pallet_Small_Decorated_A','floor',720,{wy:380,lm:['the pallet','#D2A56A']}),M('prototype/Barrel_A','floor',1020,{wy:500,base:.5,lm:['the barrel','#5DA3D9']}),M('prototype/Cube_Prototype_Large_A','floor',380,{wy:470,s:.35,lm:['the big block','#FF8A2A']})]},
{name:'Space Station',count:210,gl:true,dims:DIMS(1300,560,700),outside:'space',dark:true,wall:['panels','#2D3C6B','#3D4F86'],floor:['panels','#1F2A4D','#2E3C68'],ceil:'#243058',slab:'#161E3A',door:'#48C6E8',bd:'radial-gradient(circle at 40% 40%,#4A5C96,#0F1630)',ground:'#2D3C6B',fill:'#9FF5E6',models:[
 P('window','back',850,{w:3.4,h:2.4,base:1.7,color:'#E8EEF5',lm:['the big star window','#0B1230'],hold:false}),
 P('console','back',260,{w:2.6,h:1.1,d:.9,color:'#48C6E8',lm:['the control consoles','#48C6E8']}),P('console','back',560,{w:2.2,h:1.1,d:.9,color:'#48C6E8',lm:['the control consoles','#48C6E8']}),DOORM('prototype/Door_B',1080),
 P('box','left',380,{w:2.4,h:3,d:.3,color:'#9AB0C8',lm:['the airlock door','#9AB0C8']}),P('cupboard','left',620,{w:.9,h:1.4,d:.6,color:'#C8D2E0',lm:['the tool locker','#C8D2E0'],opens:['the tool locker']}),
 M('space/cargo_A_stacked','right',150,{off:.6,s:1.1,lm:['the cargo boxes','#E8EEF5']}),M('space/cargo_A_stacked','right',150,{off:.6,s:1.1,base:1.12,lm:['the cargo boxes','#E8EEF5']}),
 P('cupboard','right',400,{w:1.2,h:1.2,d:.7,base:1.4,color:'#2FA0C2',lm:['the supply hatch','#2FA0C2'],opens:['the supply hatch']}),M('space/lights','right',620,{off:.4}),
 M('space/structure_low','floor',450,{wy:400,lm:['the space table','#9AB0C8']}),M('space/solarpanel','floor',820,{wy:470,s:1.4,lm:['the solar panel','#3C8CF0']}),M('space/containers_A','floor',1040,{wy:540,s:1.6}),M('space/cargo_B','floor',640,{wy:580,s:1.4})]},
{name:'Coaster Control Room',count:240,gl:true,dims:DIMS(1400,580,720),outside:'coaster',wall:['panels','#35406E','#46538A'],floor:['tiles','#252C52','#343D6B'],ceil:'#2A3260',slab:'#1A2044',door:'#FFC93C',bd:'radial-gradient(circle at 40% 40%,#56639E,#161B38)',ground:'#35406E',models:[
 P('window','back',700,{w:5.6,h:2.5,base:2,color:'#FFC93C',lm:['the big window','#9ED8F5'],hold:false}),
 P('console','back',700,{w:5.4,h:1.2,d:1.1,color:'#F2425F',lm:['the giant control desk','#F2425F']}),DOORM('prototype/Door_B',1180),
 P('screen','left',380,{w:4.2,h:2.2,base:1.6,lm:['the track map screen','#1A2A48']}),P('cupboard','left',650,{w:.9,h:1.4,d:.6,color:'#8A95B8',lm:['the fuse cupboard','#8A95B8'],opens:['the fuse cupboard']}),
 P('lever','right',340,{base:1.2,sc:1.8,color:'#FFC93C',lm:['the big lever','#FFC93C']}),P('cupboard','right',110,{w:1,h:1.2,d:.7,color:'#C92E48',lm:['the desk cupboard','#C92E48'],opens:['the desk cupboard']}),
 P('screen','right',580,{w:1.6,h:1,base:2.4,lm:['the little screen','#1A2A48']}),
 M('furniture/chair_A','floor',560,{wy:250,rot:3.14}),M('furniture/chair_A','floor',840,{wy:250,rot:3.14}),M('furniture/rug_rectangle_stripes_A','floor',700,{wy:500,lm:['the rug','#F2424F']})]}
];
const MAPXY=[[200,190],[410,165],[620,195],[830,165],[870,375],[650,400],[430,375],[210,400],[420,585],[690,590]];
const GAGS=[['duck','Rubber Duck Drop','SQUEAK!','A rubber duck bonks down from the ceiling and bounces.','yellow','circle'],['glove','Boxing Glove Spring','BOING!','A spring-loaded glove pops out of the wall.','red','heart'],['confetti','Confetti Shower','WHOOPS!','Confetti rains everywhere. Party for the wrong button!','pink','star'],['parp','Trumpet Parp','PARP!','A tiny trumpet plays the saddest note ever.','orange','triangle'],['disco','Disco Lights','BOOGIE!','The lights go disco and a glitter ball drops down.','purple','hexagon'],['pie','Custard Pie Splat','SPLAT!','A custard pie flies out and splats on the camera.','white','circle'],['cushion','Whoopee Cushion','PFFFT!','Someone sat on a whoopee cushion. Was it Bip?','pink','cloud'],['jack','Jack-in-the-Box','POP!','A clown pops up on a wobbly spring.','blue','square'],['bubbles','Bubble Storm','BLOOP!','Hundreds of bubbles float up and pop.','blue','circle'],['chicken','Rubber Chicken','BAWK!','A rubber chicken drops down and squawks.','yellow','heart'],['snow','Indoor Snow','BRRR!','It starts snowing. Indoors!','white','star'],['balloons','Balloon Float-Away','WHOOSH!','Balloons tie themselves to Bip and lift him up.','red','circle'],['flip','Upside-Down Room','WHOA!','The whole room flips upside down for a second.','green','arrow'],['tickle','Tickle Feather','HEE HEE!','A giant feather tickles the Muddler.','pink','heart'],['goo','Green Goo Drip','SPLODGE!','Green goo drips from the ceiling.','green','cloud'],['banana','Banana Peel Slip','WHEE-OOPS!','Bip slips on a banana skin and spins.','yellow','triangle'],['sneeze','Giant Sneeze','A-CHOO!','The room sneezes. Everything wobbles.','orange','cloud'],['tash','Moustache on Bip','TA-DA!','Bip suddenly has a very fancy moustache.','black','square'],['squirt','Squirty Flower','SPLOSH!','A flower squirts water right in your face.','green','star'],['raincloud','Tiny Rain Cloud','DRIP DRIP!','A tiny cloud rains on just the Muddler.','blue','cloud'],['frogs','Frog Chorus','RIBBIT!','A row of frogs sing a silly song.','green','circle'],['balls','Bouncy Ball Flood','BOING BOING!','Bouncy balls pour out of a pipe.','red','circle'],['accordion','Sad Accordion','WHEEEZE!','An accordion plays a very sad tune.','purple','square'],['glitter','Glitter Bomb','SPARKLE!','Glitter everywhere. Everywhere.','purple','star'],['cuckoo','Cuckoo Clock','CUCKOO!','A cuckoo pops out and tells you off.','orange','hexagon'],['socks','Sock Rain','FLOP!','Smelly socks fall from the sky.','white','heart'],['jelly','Jelly Wobble','WIBBLE!','The floor turns to jelly for a moment.','pink','hexagon'],['hammer','Squeaky Hammer','BONK!','A squeaky hammer bonks the Muddler on the hat.','red','square'],['spaghetti','Spaghetti Drop','SLURP!','A plate of spaghetti lands on Bip\'s head.','orange','circle'],['tuba','Tuba Blast','BWAAAMP!','A tuba blasts so loud the Muddler\'s hat flies off.','yellow','arrow']];
const ANIM_GAGS=['duck','glove','confetti','disco','parp'];
const PLAYERS={Caleb:{shape:'circle',color:'blue'},Ezra:{shape:'hexagon',color:'green'}};
function gMul(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gPat(k,a,b){switch(k){
case 'stripes':return `repeating-linear-gradient(90deg,${a} 0 38px,${b} 38px 76px)`;
case 'dots':return `radial-gradient(circle,${b} 8px,transparent 9px) 0 0/52px 52px,${a}`;
case 'planks':return `repeating-linear-gradient(0deg,${a} 0 52px,${b} 52px 57px)`;
case 'tiles':return `linear-gradient(${b} 3px,transparent 3px) 0 0/46px 46px,linear-gradient(90deg,${b} 3px,transparent 3px) 0 0/46px 46px,${a}`;
case 'stones':return `radial-gradient(ellipse 38px 20px at 50% 50%,${b} 70%,transparent 74%) 0 0/92px 50px,radial-gradient(ellipse 38px 20px at 50% 50%,${b} 70%,transparent 74%) 46px 25px/92px 50px,${a}`;
case 'panels':return `linear-gradient(${b} 5px,transparent 5px) 0 0/100% 140px,linear-gradient(90deg,${b} 5px,transparent 5px) 0 0/125px 100%,${a}`;
case 'stars':return `radial-gradient(circle,${b} 2.5px,transparent 3.5px) 0 0/64px 64px,radial-gradient(circle,${b} 1.5px,transparent 2.5px) 32px 32px/64px 64px,${a}`;
case 'pegboard':return `radial-gradient(circle,${b} 4px,transparent 5px) 0 0/34px 34px,${a}`;
case 'checker':return `repeating-conic-gradient(${a} 0 25%,${b} 0 50%) 0 0/104px 104px`;}return a;}
function gFmt(s){s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function gParts(a){return a.map(x=>Array.isArray(x)?{t:x[0],b:true,n:false}:{t:x,b:false,n:true});}

function genRoom(n,seed,player){
  const R=ROOMS[n-1],r=gMul(seed);
  const pick=a=>a[Math.floor(r()*a.length)];
  const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const LY=layoutRoom(R),lms=LY.lms,drs=LY.drs;
  const WD=R.dims||WALLDIM,DR=LY.door||DOOR;
  const inR=(px,py,o,m)=>px>o.x-m&&px<o.x+o.w+m&&py>o.y-m&&py<o.y+o.h+m;
  const pools={back:[],left:[],right:[],floor:[]};
  for(const w of ['back','left','right','floor']){const [W,H]=WD[w];
    for(let y=36;y<H-30;y+=52)for(let x=36;x<W-30;x+=52){
      const sx=x+(r()-.5)*10,sy=y+(r()-.5)*10;
      if(w==='back'&&inR(sx,sy,DR,30))continue;
      if(drs.some(d=>d.wall===w&&inR(sx,sy,d,24)))continue;
      let on=null,bad=false;
      for(const l of lms){if(l.wall!==w)continue;if(inR(sx,sy,l,-22)&&!l.noOn){if(!on)on=l.id;}else if(inR(sx,sy,l,20))bad=true;}
      if(bad&&!on)continue;
      pools[w].push({wall:w,x:sx,y:sy,on});
    }
    pools[w]=shuf(pools[w]);
  }
  const nC=Math.min(9,4+n),nS=Math.min(8,3+n);
  const cols=shuf(G_COLORS).slice(0,nC),shs=shuf(G_SHAPES).slice(0,nS);
  const LET='ABCDEFGHJKLMNPRSTWZ'.split('');
  const feat=()=>{const u=r();let symType,sym='';
    const sp=n<=2?[.5,.85,1,1]:[.3,.6,.82,1];
    if(u<sp[0])symType='none';else if(u<sp[1]){symType='letter';sym=pick(LET);}else if(u<sp[2]){symType='number';sym=1+Math.floor(r()*9);}else{symType='pic';sym=pick(G_PICS);}
    const size=n<=2?(r()<.8?'normal':'big'):(r()<.25?'tiny':r()<.72?'normal':'big');
    const f=r();const finish=n<=2?(f<.7?'shiny':f<.85?'stripy':'spotty'):(f<.4?'shiny':f<.55?'glowing':f<.7?'stripy':f<.85?'spotty':'rubbery');
    return {color:pick(cols),shape:pick(shs),symType,sym,size,finish};};
  const B=[];
  const W8=[['back',.45],['left',.2],['right',.2],['floor',.15]];
  // giant comedy button on the floor
  const FW=WD.floor[0],FD=WD.floor[1],gs=pools.floor.find(s=>s.x>FW*.2&&s.x<FW*.5&&s.y>FD*.3&&s.y<FD*.6)||pools.floor[0];
  const giant={id:'g',...feat(),size:'giant',wall:'floor',x:gs.x,y:gs.y,on:null,inD:null};
  pools.floor=pools.floor.filter(s=>Math.hypot(s.x-gs.x,s.y-gs.y)>95);
  for(let i=0;i<R.count;i++){
    let u=r(),w='back';for(const [k,p] of W8){if(u<p){w=k;break;}u-=p;}
    const s=pools[w].pop()||pools.back.pop();if(!s)break;
    B.push({id:'b'+i,...feat(),wall:s.wall,x:s.x,y:s.y,on:s.on,inD:null});
  }
  drs.forEach((d,di)=>{const sp=46,nc=Math.max(1,Math.floor(d.w/sp)),nr=Math.max(1,Math.floor(d.h/sp)),cells=[];for(let i=0;i<nc;i++)for(let j=0;j<nr;j++)cells.push([d.x+d.w*(i+.5)/nc,d.y+d.h*(j+.5)/nr]);
    const k=Math.min(Math.max(0,cells.length-1),d.w*d.h>40000?4:3);const sc=shuf(cells);d.free=sc.slice(k);sc.slice(0,k).forEach((c,j)=>B.push({id:'d'+di+'_'+j,...feat(),size:Math.min(d.w,d.h)<80?'tiny':'normal',wall:d.wall,x:c[0],y:c[1],on:null,inD:d.id}));});
  B.push(giant);
  B.forEach(b=>{const H=WD[b.wall][1];b.high=b.wall!=='floor'&&b.y<H/2;
    b.near=null;if(!b.on&&!b.inD){const l=lms.find(l=>!l.anon&&l.wall===b.wall&&inR(b.x,b.y,l,70));if(l)b.near=l.id;}});
  let cand=B.filter(b=>b.size!=='giant');
  if(n>=3&&r()<.3){const dc=cand.filter(b=>b.inD);if(dc.length)cand=dc;}
  let T=pick(cand);
  if(n>=6&&r()<.12)T=giant;
  if(player&&r()<.3){T.symType='letter';T.sym=player[0];}
  const L=id=>lms.find(l=>l.id===id)||drs.find(d=>d.id===id);
  const C=[];const add=(tier,key,test,parts,chip)=>C.push({tier,key,test,parts,chip});
  add(1,'col',b=>b.color===T.color,["It's ",[T.color],"."],{kind:'colour',value:T.color});
  add(1,'sh',b=>b.shape===T.shape,["It's ",[SH_TXT[T.shape]],"."],{kind:'shape',value:T.shape});
  const oc=[...new Set(B.filter(b=>b.color!==T.color).map(b=>b.color))];
  if(oc.length){const c=pick(oc);add(1,'ncol',b=>b.color!==c,["It's ",['not']," "+c+"."],{kind:'colour',value:c,not:true});}
  const os=[...new Set(B.filter(b=>b.shape!==T.shape).map(b=>b.shape))];
  if(os.length){const c=pick(os);add(1,'nsh',b=>b.shape!==c,["It's ",['not']," "+SH_TXT[c]+"."],{kind:'shape',value:c,not:true});}
  if(T.symType==='none')add(1,'sym',b=>b.symType==='none',["It has ",['nothing']," on it."],{kind:'symbol',value:'blank'});
  if(T.symType==='letter')add(1,'sym',b=>b.symType==='letter'&&b.sym===T.sym,player&&T.sym===player[0]?["It's the first letter of ",['your']," name."]:["It has the letter ",[T.sym]," on it."],{kind:'symbol',value:T.sym});
  if(T.symType==='number'){add(1,'sym',b=>b.symType==='number'&&b.sym===T.sym,["It has the number ",[String(T.sym)],"."],{kind:'symbol',value:String(T.sym)});
    if(T.sym>5)add(2,'n5',b=>b.symType==='number'&&b.sym>5,["Its number is ",['bigger than 5'],"."],{kind:'symbol',value:'>5'});
    if(T.sym<5)add(2,'n5',b=>b.symType==='number'&&b.sym<5,["Its number is ",['smaller than 5'],"."],{kind:'symbol',value:'<5'});}
  if(T.symType==='pic')add(1,'sym',b=>b.symType==='pic'&&b.sym===T.sym,["It has ",[PIC_TXT[T.sym]]," on it."],{kind:'symbol',value:T.sym});
  add(1,'wall',b=>b.wall===T.wall,T.wall==='floor'?["It's on the ",['floor'],"."]:["It's on the ",[T.wall+' wall'],"."],{kind:'position',value:T.wall});
  if(T.wall!=='floor')add(2,'hi',b=>b.wall!=='floor'&&b.high===T.high,["It's ",[T.high?'up high':'down low'],"."],{kind:'position',value:'none',height:T.high?'high':'low'});
  if(T.on&&L(T.on).name)add(2,'on',b=>!!b.on&&L(b.on).name===L(T.on).name,["It's on ",[L(T.on).name],"."],{kind:'landmark',value:L(T.on).color});
  if(T.inD)add(2,'in',b=>b.inD===T.inD,["It's hiding ",['inside '+L(T.inD).name],"."],{kind:'landmark',value:L(T.inD).color});
  if(T.near)add(2,'near',b=>!!b.near&&L(b.near).name===L(T.near).name,["It's ",['next to '+L(T.near).name],"."],{kind:'landmark',value:L(T.near).color});
  if(T.size!=='normal')add(2,'size',b=>b.size===T.size,T.size==='giant'?["It's the ",['GIANT']," one!"]:["It's ",[T.size],"."],{kind:'size',value:T.size});
  if(T.finish!=='shiny')add(2,'fin',b=>b.finish===T.finish,["It's ",[FIN_TXT[T.finish]],"."],{kind:'finish',value:T.finish});
  const corner=s=>s==='circle'||s==='cloud'?'round':s;
  add(3,'rid',b=>b.color===T.color&&corner(b.shape)===corner(T.shape),["I'm the colour of ",[RID_C[T.color]]," and ",[RID_S[T.shape]],"."],{kind:'riddle'});
  const wn=T.wall==='floor'?'floor':T.wall+' wall';
  if(B.filter(b=>b.wall===T.wall&&b.color===T.color).length===1)add(3,'only',b=>b.wall===T.wall&&b.color===T.color,["It's the ",['only '+T.color+' one']," on the "+wn+"."],{kind:'colour',value:T.color});
  if(T.on&&L(T.on).name){const row=B.filter(b=>b.on&&b.wall===T.wall&&L(b.on).name===L(T.on).name).sort((a,b)=>a.x-b.x);const k=row.indexOf(T)+1;
    if(row.length>=3&&k<=4)add(3,'ord',b=>b===T,["It's the ",[['','1st','2nd','3rd','4th'][k]+' from the left']," on "+L(T.on).name+"."],{kind:'order',value:String(k)});}
  const maxT=n<=2?1:n<=5?2:3;
  const pool=shuf(C.filter(c=>c.tier<=maxT));
  let S=B.slice();const used=[];
  while(S.length>1&&used.length<7){
    const v=pool.filter(c=>!used.includes(c)).map(c=>({c,rem:S.filter(c.test)})).filter(o=>o.rem.length<S.length);
    if(!v.length)break;v.sort((a,b)=>b.rem.length-a.rem.length);
    const o=used.length>=4?v[v.length-1]:v[Math.floor(r()*Math.min(3,v.length))];
    used.push(o.c);S=o.rem;}
  if(S.length>1){let col=used.find(c=>c.key==='col');if(!col){col=C.find(c=>c.key==='col');used.push(col);}
    B.forEach(b=>{if(b!==T&&used.every(c=>c.test(b)))b.color=G_COLORS.find(c=>c!==T.color&&cols.includes(c))||'white';});}
  const pi=used.findIndex(c=>c.key!=='ncol'&&c.key!=='nsh');if(pi>0)used.unshift(used.splice(pi,1)[0]);
  const initN=1; // one clue up front (no difficulty setting)
  let initial=used.slice(0,initN),rest=used.slice(initN);
  const extra=shuf(pool.filter(c=>!used.includes(c)));
  while(rest.length<3&&extra.length)rest.push(extra.pop());
  const clues=[];let cid=0;
  const mk=(c,f)=>({id:'c'+(cid++),parts:gParts(c.parts),chip:c.chip,test:c.test||(()=>true),...(f||{})});
  const initObjs=initial.map(c=>mk(c));
  let restObjs=rest.map(c=>mk(c));
  if(n>=8){const fake=pick(cols.filter(c=>c!==T.color));
    restObjs.unshift(mk({parts:["It's ",[fake],"! Honest!"],chip:{kind:'muddler'}},{lie:true}));
    restObjs.push(mk({parts:["Psst! The ",["Muddler's"]," clue is a ",['fib'],"."],chip:{kind:'fib'}},{meta:true}));}
  while(restObjs.length>5){const i=restObjs.findIndex(c=>!c.lie&&!c.meta);initObjs.push(restObjs.splice(i,1)[0]);}
  // clue things hide: inside openables, tucked on furniture, up high, or low in corners (never in plain mid-wall view)
  const hidden=s=>{const H=WD[s.wall][1],W=WD[s.wall][0];return (s.on?3:0)+(s.wall!=='floor'&&s.y<H*.22?2:0)+(s.wall!=='floor'&&s.y>H*.8?2:0)+(s.x<W*.12||s.x>W*.88?1:0)+(s.wall==='floor'?1:0)+r()*1.5;};
  const allSlots=[...pools.back,...pools.left,...pools.right,...pools.floor.filter(s=>s.y>90)].map(s=>({s,k:hidden(s)})).sort((a,b)=>a.k-b.k).map(o=>o.s);
  const types=shuf(['note','parrot','tv','cookie','bottle']);
  const dPool=shuf(drs.filter(d=>d.free&&d.free.length));const pIn=n<=1?.2:n<=4?.4:.55;
  let things=restObjs.map((c,i)=>{const ty=types[i%5];
    if(dPool.length&&r()<pIn){const d=dPool.shift(),cl=d.free.pop();return {id:'t'+i,type:ty,clue:c.id,wall:d.wall,x:cl[0],y:cl[1],on:null,inD:d.id};}
    const s=allSlots.pop();if(!s){initObjs.push(c);return null;}return {id:'t'+i,type:ty,clue:c.id,wall:s.wall,x:s.x,y:s.y,on:s.on};}).filter(Boolean);
  return {n,R,lms,drs,buttons:B,target:T,clues:[...initObjs,...restObjs],initial:initObjs.map(c=>c.id),things};
}


export { G_COLORS, G_HEX, G_SHAPES, G_PICS, SH_TXT, PIC_TXT, FIN_TXT, BSIZE, THING_SAY, CAPW, BOUNDS, OPENS, ROOMS, MAPXY, GAGS, ANIM_GAGS, PLAYERS, layoutRoom, genRoom, gMul, gFmt, gParts };
