particlesJS("particles-js", {
  "particles": {
    "number": { "value": 100 }, // Cantidad de puntos
    "color": { "value": "#ffffff" }, // Color de los puntos
    "shape": { "type": "circle" },
    "opacity": { "value": 0.5 },
    "size": { "value": 3 },
    "line_linked": {
      "enable": true, // Dibuja las líneas entre puntos
      "distance": 150,
      "color": "#ffffff",
      "opacity": 0.4,
      "width": 1
    },
    "move": {
      "enable": true,
      "speed": 2 // Velocidad constante
    }
  },
  "interactivity": {
    "detect_on": "canvas",
    "events": {
      "onhover": {
        "enable": true,
        "mode": "grab" // Las líneas se "pegan" al cursor cuando pasas cerca
      }
    }
  },
  "retina_detect": true
});