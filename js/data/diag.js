// Diagnóstico por síntoma.
// cada causa: [pieza, causa, qué hacer, guía (texto de búsqueda en KB o null)]
export const DIAG = [
 {cat:'Ruidos', items:[
  {id:'clic', t:'Clic o “clac” en cada pedalada', causas:[
    ['pedales','Pedal suelto o rodamiento del pedal seco','Aprieta el pedal con llave de 15 mm (el izquierdo aprieta al revés).','pedal suelto cruje'],
    ['bielas','Biela suelta','Aprieta el perno central de cada biela.','eje pedalier con juego'],
    ['cadena','Un eslabón rígido o sin lubricar','Gira el pedal hacia atrás buscando el eslabón que salta y lubrícalo.','cadena suena lubricar'],
    ['sillin','La tija o los rieles del sillín se mueven','Aprieta la abrazadera del sillín y el tornillo bajo él.','sillin altura'],
    ['cuadro','Crujido del cuadro (raro)','Si nada de lo anterior lo resuelve, revisa el cuadro por grietas.','crujido en el cuadro carbono']]},
  {id:'chirrido', t:'Chirrido constante al andar', causas:[
    ['cadena','Cadena seca','Limpia y lubrica la cadena.','cadena suena lubricar'],
    ['desviador','Roldanas del desviador secas','Pon una gota de lubricante en el eje de cada roldana.','cadena suena lubricar'],
    ['frenos','Un freno roza sin apretarlo','Centra la pinza o las zapatas.','el freno roza'],
    ['rueda_del','Rodamientos del buje secos','Si el ruido sigue con la rueda girando sola, revisa el buje.','juego en la rueda']]},
  {id:'chirrido_freno', t:'Chirrido fuerte al frenar', causas:[
    ['frenos','Disco o zapatas contaminados o cristalizados','Limpia con alcohol isopropílico; lija suave las pastillas o zapatas.','asentar pastillas'],
    ['frenos','Zapatas mal orientadas (frenos de llanta)','Deja la punta delantera de la zapata apenas más cerca de la llanta.','ajustar zapatas'],
    ['rueda_del','Llanta sucia (frenos de llanta)','Limpia la llanta con alcohol y un paño.','zapatas gastadas']]},
  {id:'roce', t:'Roce que suena una vez por vuelta de rueda', causas:[
    ['frenos','Disco torcido o pinza descentrada','Centra la pinza; si roza en un solo punto, endereza el disco con cuidado.','el freno roza'],
    ['rueda_del','Rueda descentrada','Centra la rueda con llave de rayos.','rueda descentrada'],
    ['guardabarros','Guardabarros descentrado','Centra el guardabarros con sus varillas.','guardabarros roza'],
    ['rueda_del','Neumático mal montado (hace un bulto)','Desinfla, acomoda el neumático parejo y vuelve a inflar.','cambiar neumatico']]},
  {id:'baches', t:'Golpeteo al pasar baches', causas:[
    ['horquilla','Dirección suelta','Frena adelante y empuja: si hay juego, ajusta la dirección.','manubrio con juego'],
    ['bisagra','Bisagra de plegado con juego','Ajusta la tensión de la bisagra.','juego en la bisagra'],
    ['rueda_del','Cierre de la rueda suelto','Cierra firme el cierre rápido o eje pasante.','sacar la rueda'],
    ['guardabarros','Guardabarros o parrilla sueltos','Aprieta sus tornillos.','guardabarros roza'],
    ['luces','Soporte de la luz suelto','Aprieta la abrazadera.','luces']]},
 ]},
 {cat:'Cambios', items:[
  {id:'salta', t:'La cadena salta sola entre piñones', causas:[
    ['tensores','Cable con poca tensión','Gira el tensor del mando un cuarto de vuelta hacia afuera.','usar los tensores'],
    ['desviador','Patilla del desviador doblada','Mira desde atrás si el desviador está paralelo a los piñones.','patilla desviador doblado'],
    ['cadena','Cadena gastada','Mide su desgaste.','medir cadena gastada'],
    ['cassette','Piñones gastados','Si salta con cadena nueva, cambia el cassette.',null]]},
  {id:'nosube', t:'No sube a un piñón más grande', causas:[
    ['tensores','Cable flojo','Gira el tensor hacia afuera (antihorario) de a un cuarto de vuelta.','usar los tensores'],
    ['desviador','Tornillo de límite L muy apretado','Suelta el tornillo L un cuarto de vuelta.','tornillos de limite'],
    ['manetas','Cable o funda sucios','Lubrica o cambia cable y funda.','cambiar cable']]},
  {id:'duro', t:'Los cambios están duros o lentos', causas:[
    ['manetas','Cable oxidado o funda sucia','Cambia cable y funda.','cambiar cable'],
    ['tensores','Cable demasiado tenso','Gira el tensor hacia adentro (horario).','usar los tensores'],
    ['desviador','Desviador sucio','Limpia y lubrica sus articulaciones.','lavar']]},
  {id:'cae', t:'La cadena se cae', causas:[
    ['desviador','Tornillos de límite desajustados','Ajusta H y L.','tornillos de limite'],
    ['desviador_del','Desviador delantero desajustado','Ajusta sus límites y el cable.','plato no sube al plato'],
    ['cadena','Cadena floja (bicis de una marcha)','Tira la rueda trasera hacia atrás hasta 1 cm de juego.','se salio la cadena'],
    ['cassette','Cadena cruzada','Evita plato grande con piñón grande, y plato chico con piñón chico.',null]]},
  {id:'roce_fd', t:'La cadena roza adelante al cambiar atrás', causas:[
    ['desviador_del','Jaula del desviador delantero mal centrada','Ajusta el tensor del mando izquierdo.','plato no sube al plato'],
    ['cassette','Cadena cruzada','Cambia de plato para usar una combinación más recta.',null]]},
 ]},
 {cat:'Frenos', items:[
  {id:'maneta', t:'La maneta llega casi al manubrio', causas:[
    ['tensores','Cable de freno flojo','Gira el tensor de la maneta hacia afuera.','usar los tensores'],
    ['frenos','Pastillas o zapatas gastadas','Revísalas y cámbialas.','cambiar pastillas'],
    ['frenos','Aire en el freno hidráulico','Necesita purga.','esponjoso']]},
  {id:'frenapoco', t:'Frena poco', causas:[
    ['frenos','Pastillas o zapatas gastadas o contaminadas','Cámbialas o límpialas; nunca uses lubricante cerca del freno.','no frena'],
    ['rueda_del','Llanta o disco sucios','Límpialos con alcohol isopropílico.','no frena'],
    ['tensores','Cable flojo','Ténsalo con el tensor.','usar los tensores']]},
  {id:'frenada', t:'La rueda gira frenada aunque no frenes', causas:[
    ['frenos','Freno descentrado','Centra la pinza o los brazos.','el freno roza'],
    ['tensores','Cable demasiado tenso','Gira el tensor hacia adentro.','usar los tensores'],
    ['rueda_del','Rueda torcida o mal puesta','Asienta la rueda hasta el fondo y revisa que esté centrada.','sacar la rueda']]},
 ]},
 {cat:'Ruedas y dirección', items:[
  {id:'desinfla', t:'La rueda se desinfla', causas:[
    ['rueda_del','Pinchazo','Repara la cámara o usa sellante si es tubeless.','pinchazo'],
    ['rueda_del','Válvula floja','Aprieta el núcleo de la válvula.','valvula'],
    ['rueda_del','Poca presión de partida','Infla a la presión indicada en el neumático.','presion']]},
  {id:'novance', t:'Pedaleo pero la bici no avanza', causas:[
    ['cadena','Cadena salida o cortada','Revisa la cadena.','cadena rota'],
    ['rueda_tras','Rueda libre que no engancha','Revisa el buje trasero.','rueda libre']]},
  {id:'tira', t:'La bici se va hacia un lado', causas:[
    ['rueditas','Rueditas a distinta altura','Déjalas a la misma altura.','rueditas'],
    ['rueda_tras','Rueda trasera chueca en el cuadro','Céntrala y aprieta el eje.','sacar la rueda'],
    ['manubrio','Manubrio desalineado','Alinea el manubrio con la rueda.','manubrio torcido'],
    ['horquilla','Horquilla doblada tras una caída','Revísala en taller.',null]]},
  {id:'juego', t:'La dirección se mueve al frenar', causas:[
    ['horquilla','Caja de dirección suelta','Ajusta la dirección.','manubrio con juego'],
    ['rueda_del','Rueda o buje suelto','Cierra el eje o ajusta el buje.','juego en la rueda']]},
  {id:'ebike', t:'La asistencia eléctrica no funciona', causas:[
    ['bateria','Batería sin carga o mal encajada','Cárgala y vuelve a encajarla.','no enciende bateria'],
    ['pantalla','Sensor de velocidad desalineado','Alinea el imán del rayo con el sensor.',null],
    ['motor','Falla del motor','Anota el código de error y consulta al servicio técnico.',null]]},
 ]},
];
