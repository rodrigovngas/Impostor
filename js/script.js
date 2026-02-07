/* ================================================================================
   1. SEGURIDAD Y CONFIGURACIÓN INICIAL
   ================================================================================ */
(function() {
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    }, false);
    document.onkeydown = function(e) {
        if (e.keyCode == 123) return false;
        if (e.ctrlKey && e.shiftKey && (e.keyCode == 'I'.charCodeAt(0) || e.keyCode == 'C'.charCodeAt(0) || e.keyCode == 'J'.charCodeAt(0))) return false;
        if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false;
    }
})();

// --- MODO OSCURO AUTOMÁTICO Y MANUAL ---
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
}
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (e.matches) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    });
}

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
}

/* ================================================================================
   2. VARIABLES GLOBALES Y ESTADO
   ================================================================================ */
const titleElement = document.querySelector('h1');
const textToType = "El Impostor";
let charIndex = 0;

let wakeLock = null;

let palabras = [];
let palabrasDisponibles = [];
let jugadores = [];
let jugadoresMezclados = [];
let impostor = null;
let palabraSeleccionada = "";
let indiceActual = 0;
let votos = {};
let duracion = 60;
let tiempoRestante = 0;
let timerRunning = false;
let rafId = null;
let startTs = null;

const SVG_PLAY = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

const btnReveal = document.getElementById('btnReveal');
const revealBox = document.getElementById('textoPalabra');

/* ================================================================================
   3. UTILIDADES DEL SISTEMA (Storage, Strings, Arrays, UI Genérica)
   ================================================================================ */
function normalize(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function mezclarArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function guardarDatos() {
    localStorage.setItem('impostor_palabras', JSON.stringify(palabras));
    localStorage.setItem('impostor_jugadores', JSON.stringify(jugadores));
}

function cargarDatos() {
    const p = localStorage.getItem('impostor_palabras');
    const j = localStorage.getItem('impostor_jugadores');
    if (p) palabras = JSON.parse(p);
    if (j) jugadores = JSON.parse(j);
}

function mostrarSeccion(id) {
    const secciones = ['admin', 'asignacion', 'pistas', 'votacion', 'resultado'];
    secciones.forEach(s => {
        const el = document.getElementById(s);
        if (s === id) {
            el.style.display = 'block';
            el.style.animation = 'none';
            el.offsetHeight;
            el.style.animation = null;
        } else {
            el.style.display = 'none';
        }
    });
}

function showError(errorElem, message) {
    if (errorElem.timer) clearTimeout(errorElem.timer);
    errorElem.innerText = message;
    errorElem.classList.add('show');
    errorElem.timer = setTimeout(() => {
        errorElem.classList.remove('show');
        setTimeout(() => {
            if (!errorElem.classList.contains('show')) {
                errorElem.innerText = '';
            }
        }, 500);
    }, 3000);
}

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock Activo');
        } catch (err) {
            console.error(err);
        }
    }
}

/* ================================================================================
   4. SISTEMA DE ALERTAS Y MODALES
   ================================================================================ */
function mostrarConfirmacion() {
    const overlay = document.getElementById('toastOverlay');
    overlay.style.display = 'flex';
    overlay.offsetHeight;
    overlay.classList.add('active');
    if (navigator.vibrate) navigator.vibrate(50);
}

function cerrarConfirmacion() {
    const overlay = document.getElementById('toastOverlay');
    overlay.classList.remove('active');
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

function confirmarReinicio() {
    palabras = [];
    jugadores = [];
    localStorage.removeItem('impostor_palabras');
    localStorage.removeItem('impostor_jugadores');
    resetGameData();
    renderPalabras();
    renderJugadores();
    mostrarSeccion('admin');
    cerrarConfirmacion();
}

function showAlertMessage(title, msg) {
    const ov = document.getElementById('genericAlertOverlay');
    const t = document.getElementById('genericAlertTitle');
    const m = document.getElementById('genericAlertMsg');
    t.innerText = title;
    m.innerText = msg;
    ov.style.display = 'flex';
    ov.offsetHeight;
    ov.classList.add('active');
    if (navigator.vibrate) navigator.vibrate(50);
}

function cerrarAlertaGenerica() {
    const ov = document.getElementById('genericAlertOverlay');
    ov.classList.remove('active');
    setTimeout(() => {
        ov.style.display = 'none';
        mostrarSeccion('admin');
    }, 300);
}

function mostrarAlertaTiempo() {
    const ov = document.getElementById('timeOutOverlay');
    ov.style.display = 'flex';
    ov.offsetHeight;
    ov.classList.add('active');
}

function finalizarTiempoYContinuar() {
    const ov = document.getElementById('timeOutOverlay');
    ov.classList.remove('active');
    setTimeout(() => {
        ov.style.display = 'none';
        saltarAPuesta();
    }, 300);
}

function irAlInicio() {
    const ov = document.getElementById('alertFinOverlay');
    ov.classList.remove('active');
    setTimeout(() => {
        ov.style.display = 'none';
        mostrarSeccion('admin');
    }, 300);
}

/* ================================================================================
   5. GESTIÓN DE JUGADORES Y PALABRAS (CRUD)
   ================================================================================ */
function agregarPalabra() {
    const input = document.getElementById('nuevaPalabra');
    const errorElem = document.getElementById('errorPalabra');
    errorElem.innerText = ''; 
    let p = input.value.trim();

    if (!p) {
        showError(errorElem, 'La palabra no puede estar vacía.');
        input.value = '';
        return;
    }
    const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    if (!regex.test(p)) {
        showError(errorElem, 'Solo se permiten letras y espacios.');
        input.value = '';
        return;
    }
    if (p.length < 2 || p.length > 20) {
        showError(errorElem, 'La palabra debe tener entre 2 y 20 caracteres.');
        input.value = '';
        return;
    }
    const normalizedP = normalize(p);
    const exists = palabras.some(word => normalize(word) === normalizedP);
    if (exists) {
        showError(errorElem, 'Esta palabra ya existe.');
        input.value = '';
        return;
    }

    palabras.push(p);
    guardarDatos(); 
    renderPalabras();
    input.value = '';
    input.focus();
}

function eliminarPalabra(index) {
    palabras.splice(index, 1);
    guardarDatos(); 
    renderPalabras();
}

function renderPalabras() {
    const ul = document.getElementById('listaPalabras');
    ul.innerHTML = '';
    if (palabras.length === 0) {
        ul.innerHTML = '<li style="justify-content:center; color:var(--text-muted); font-style:italic; background:transparent; border:none">No hay palabras</li>';
    }
    palabras.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p}</span><button class="btn-icon btn-delete" onclick="eliminarPalabra(${index})">&times;</button>`;
        ul.appendChild(li);
    });
}

function agregarJugador() {
    const input = document.getElementById('nombreJugador');
    const errorElem = document.getElementById('errorJugador');
    errorElem.innerText = ''; 
    let name = input.value.trim();

    if (!name) {
        showError(errorElem, 'El nombre no puede estar vacío.');
        input.value = '';
        return;
    }
    const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    if (!regex.test(name)) {
        showError(errorElem, 'Solo se permiten letras y espacios.');
        input.value = '';
        return;
    }
    if (name.length < 2 || name.length > 20) {
        showError(errorElem, 'El nombre debe tener entre 2 y 20 caracteres.');
        input.value = '';
        return;
    }
    const normalizedName = normalize(name);
    const exists = jugadores.some(jug => normalize(jug) === normalizedName);
    if (exists) {
        showError(errorElem, 'Este nombre ya existe.');
        input.value = '';
        return;
    }

    jugadores.push(name);
    guardarDatos(); 
    renderJugadores();
    input.value = '';
    input.focus();
}

function eliminarJugador(index) {
    jugadores.splice(index, 1);
    guardarDatos(); 
    renderJugadores();
}

function renderJugadores() {
    const ul = document.getElementById('listaJugadores');
    ul.innerHTML = '';
    if (jugadores.length === 0) {
        ul.innerHTML = '<li style="justify-content:center; color:var(--text-muted); font-style:italic; background:transparent; border:none">No hay jugadores</li>';
    }
    jugadores.forEach((j, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${j}</span><button class="btn-icon btn-delete" onclick="eliminarJugador(${index})">&times;</button>`;
        ul.appendChild(li);
    });
}

function reiniciarTodo() {
    mostrarConfirmacion();
}

/* ================================================================================
   6. LÓGICA PRINCIPAL DEL JUEGO (Ciclo de Vida)
   ================================================================================ */
function resetGameData() {
    jugadoresMezclados = [];
    impostor = null;
    palabraSeleccionada = '';
    votos = {};
    stopTemporizador();
}

function iniciarJuego() {
    if (jugadores.length < 3) {
        showAlertMessage('Faltan jugadores', 'Se requieren mínimo 3 jugadores.');
        return;
    }
    if (palabras.length === 0) {
        showAlertMessage('Faltan palabras', 'Agrega al menos una palabra.');
        return;
    }

    duracion = Number(document.getElementById('duracionSelect').value || 60);
    palabrasDisponibles = [...palabras];

    requestWakeLock();
    nuevaRonda();
}

function nuevaRonda() {
    votos = {};
    document.getElementById('guessFeedback').innerText = '';
    document.getElementById('guessInput').value = '';
    document.getElementById('impostorGuessSection').style.display = 'none';

    if (palabrasDisponibles.length === 0) {
        const ov = document.getElementById('alertFinOverlay');
        ov.style.display = 'flex';
        ov.offsetHeight;
        ov.classList.add('active');
        return;
    }

    const oldWrapper = document.querySelector('.timer-wrap');
    if (oldWrapper) {
        const newWrapper = oldWrapper.cloneNode(true);
        newWrapper.classList.remove('critical');
        const newCircle = newWrapper.querySelector('#timerCircle');
        if(newCircle) {
            newCircle.classList.remove('critical');
            newCircle.style.stroke = 'var(--accent)';
            newCircle.style.filter = 'drop-shadow(0 0 4px var(--accent-glow))';
        }
        const newNum = newWrapper.querySelector('#timerNumber');
        if(newNum) newNum.classList.remove('critical');

        oldWrapper.parentNode.replaceChild(newWrapper, oldWrapper);
    }

    const randomIndex = Math.floor(Math.random() * palabrasDisponibles.length);
    palabraSeleccionada = palabrasDisponibles[randomIndex];
    palabrasDisponibles.splice(randomIndex, 1);

    jugadoresMezclados = mezclarArray([...jugadores]);

    impostor = jugadoresMezclados[Math.floor(Math.random() * jugadoresMezclados.length)];

    indiceActual = 0;
    document.getElementById('totalAsignacion').innerText = jugadoresMezclados.length;
    cargarJugador();
    mostrarSeccion('asignacion');
    stopTemporizador();
    tiempoRestante = duracion;
    actualizarTimerUI(duracion);
}

function cargarJugador() {
    const jugador = jugadoresMezclados[indiceActual];
    document.getElementById('nombreJugadorAsignacion').innerText = jugador;
    document.getElementById('indiceAsignacion').innerText = (indiceActual + 1);

    const elem = document.getElementById('textoPalabra');
    elem.style.display = 'none';
    elem.className = 'reveal';

    const btn = document.getElementById('btnReveal');
    btn.style.display = 'flex';
    btn.style.opacity = '1';

    document.getElementById('btnSiguiente').classList.add('btn-locked');
}

function siguienteJugador() {
    document.getElementById('textoPalabra').style.display = 'none';
    indiceActual++;
    if (indiceActual >= jugadoresMezclados.length) {
        document.getElementById('botonIniciarTimer').innerHTML = SVG_PLAY + " Iniciar";
        prepararVotacion();
        mostrarSeccion('pistas');
        return;
    }
    cargarJugador();
}

function showContent(e) {
    if (e.cancelable && e.type === 'touchstart') e.preventDefault();

    const jugador = jugadoresMezclados[indiceActual];
    if (jugador === impostor) {
        revealBox.className = 'reveal impostor-mode';
        revealBox.innerHTML = `<div class="reveal-title">Tu misión</div><div class="reveal-impostor-text">IMPOSTOR</div><div style="font-size:13px; margin-top:8px; opacity:0.8; color:var(--danger)">Engaña a todos</div>`;
    } else {
        revealBox.className = 'reveal';
        revealBox.innerHTML = `<div class="reveal-title">La palabra es</div><div class="reveal-word">${palabraSeleccionada}</div>`;
    }

    btnReveal.style.display = 'none';
    revealBox.style.display = 'flex';

    document.getElementById('btnSiguiente').classList.remove('btn-locked');

    document.addEventListener('mouseup', hideContent);
    document.addEventListener('touchend', hideContent);
    document.addEventListener('touchcancel', hideContent);
}

function hideContent() {
    revealBox.style.display = 'none';
    btnReveal.style.display = 'flex';
    document.removeEventListener('mouseup', hideContent);
    document.removeEventListener('touchend', hideContent);
    document.removeEventListener('touchcancel', hideContent);
}

/* ================================================================================
   7. LÓGICA DEL TEMPORIZADOR
   ================================================================================ */
function iniciarTemporizador() {
    const btn = document.getElementById('botonIniciarTimer');

    if (timerRunning) {
        stopTemporizador();
        btn.innerHTML = SVG_PLAY + " Reanudar";
        return;
    }

    if (tiempoRestante <= 0) tiempoRestante = duracion;

    btn.innerHTML = SVG_PAUSE + " Pausar";
    timerRunning = true;

    startTs = performance.now() - ((duracion - tiempoRestante) * 1000);

    function tick(now) {
        const elapsed = (now - startTs) / 1000;
        tiempoRestante = Math.max(0, duracion - elapsed);

        actualizarTimerUI(tiempoRestante);

        if (tiempoRestante > 0 && timerRunning) {
            rafId = requestAnimationFrame(tick);
        } else {
            timerRunning = false;
            rafId = null;
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            mostrarAlertaTiempo();
        }
    }

    rafId = requestAnimationFrame(tick);
}

function stopTemporizador() {
    timerRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
}

function actualizarTimerUI(segundos) {
    const numElem = document.getElementById('timerNumber');
    const circle = document.getElementById('timerCircle');
    const wrapper = document.querySelector('.timer-wrap'); 
    
    const duracionSelect = document.getElementById('duracionSelect');
    const duracion = duracionSelect ? parseInt(duracionSelect.value) : 60;
    
    if(numElem) numElem.innerText = Math.ceil(segundos);
    
    const pct = Math.max(0, Math.min(1, segundos / duracion));
    const circumference = 283; 
    const offset = circumference - (pct * circumference);
    
    if(circle) {
        circle.style.strokeDashoffset = offset;

        if (segundos <= 15) {
            if(wrapper) wrapper.classList.add('critical');
            
            circle.classList.add('critical');
            if(numElem) numElem.classList.add('critical');
            
            circle.style.stroke = ''; 
            circle.style.filter = '';
        } else {
            if(wrapper) wrapper.classList.remove('critical');
            
            circle.classList.remove('critical');
            if(numElem) numElem.classList.remove('critical');
            
            circle.style.stroke = 'var(--accent)';
            circle.style.filter = 'drop-shadow(0 0 4px var(--accent-glow))';
        }
    }
}

/* ================================================================================
   8. LÓGICA DE VOTACIÓN Y RESULTADOS
   ================================================================================ */
function saltarAPuesta() {
    stopTemporizador();
    prepararVotacion();
    mostrarSeccion('votacion');
}

function prepararVotacion() {
    const container = document.getElementById('voteContainer');
    container.innerHTML = '';
    container.classList.remove('has-selection');
    votos = {};
    jugadores.forEach(jugador => {
        const btn = document.createElement('button');
        btn.className = 'vote-card';
        btn.innerText = jugador;
        btn.dataset.originalName = jugador;
        btn.onclick = function() {
            registrarVotoUnico(jugador, btn);
        };
        container.appendChild(btn);
    });
}

function registrarVotoUnico(elegido, btnElement) {
    const container = document.getElementById('voteContainer');
    const yaEstabaSeleccionado = btnElement.classList.contains('voted');

    const allBtns = container.querySelectorAll('.vote-card');
    allBtns.forEach(b => {
        b.classList.remove('voted');
        b.innerText = b.dataset.originalName;
    });

    votos = {};

    if (!yaEstabaSeleccionado) {
        votos[elegido] = 1;
        container.classList.add('has-selection');
        btnElement.classList.add('voted');
        btnElement.innerText = "Eliminar a\n" + elegido;
        if (navigator.vibrate) navigator.vibrate(50);
    } else {
        container.classList.remove('has-selection');
    }
}

function mostrarResultado() {
    let masVotado = null;
    let max = -1;

    for (const k in votos) {
        if (votos[k] > max) {
            max = votos[k];
            masVotado = k;
        }
    }

    const res = document.getElementById('textoResultado');
    const guessSection = document.getElementById('impostorGuessSection');

    const htmlPalabra = `<div style="margin-top:12px; font-size:18px; color:var(--text-muted)">La palabra era <strong style="color:var(--text-main)">${palabraSeleccionada}</strong></div>`;

    if (!masVotado) {
        res.innerHTML = `El impostor era <span style="color:var(--danger)">${impostor}</span>.${htmlPalabra}`;
    } else if (masVotado === impostor) {
        res.innerHTML = `Efectivamente el impostor era <strong style="color:var(--danger)">${impostor}</strong>.${htmlPalabra}`;
    } else {
        res.innerHTML = `JAJAJA fallaron, el impostor era <strong style="color:var(--danger)">${impostor}</strong>.${htmlPalabra}`;
    }

    guessSection.style.display = 'none';

    mostrarSeccion('resultado');
}

function impostorAdivina() {
    const intento = document.getElementById('guessInput').value.trim();
    const feed = document.getElementById('guessFeedback');
    if (!intento) {
        feed.innerText = 'Escribe algo primero.';
        return;
    }
    if (intento.toLowerCase() === palabraSeleccionada.toLowerCase()) {
        feed.style.color = '#10b981';
        feed.innerText = '¡INCREÍBLE! Ganaste.';
    } else {
        feed.style.color = 'var(--danger)';
        feed.innerText = `Nop. Era "${palabraSeleccionada}".`;
    }
}

/* ================================================================================
   9. EFECTOS VISUALES
   ================================================================================ */
function typeWriter() {
    if (charIndex < textToType.length) {
        let currentText = titleElement.childNodes[0].nodeValue || "";
        titleElement.childNodes[0].nodeValue = currentText + textToType.charAt(charIndex);
        charIndex++;
        setTimeout(typeWriter, 120);
    } else {
        setTimeout(() => {
            titleElement.childNodes[0].nodeValue = "";
            charIndex = 0;
            typeWriter();
        }, 10000);
    }
}
titleElement.innerHTML = '<span class="status-dot"></span>';
titleElement.insertBefore(document.createTextNode(""), titleElement.firstChild);
setTimeout(typeWriter, 300);

/* ================================================================================
   10. LISTENERS Y EVENTOS DE INICIALIZACIÓN
   ================================================================================ */
// --- Listeners de Visibilidad (WakeLock) ---
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// --- Listeners de Inputs (Teclado) ---
document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const f = document.activeElement;
        if (f.id === 'nuevaPalabra') agregarPalabra();
        if (f.id === 'nombreJugador') agregarJugador();
        if (f.id === 'guessInput') impostorAdivina();
    }
});

// --- Listeners de Interacción (Reveal Button) ---
btnReveal.addEventListener('mousedown', showContent);
btnReveal.addEventListener('touchstart', showContent, {
    passive: false
});

// --- Listeners de Gestos Táctiles ---
document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
});
document.addEventListener('touchmove', function(e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
    if (typeof e.scale === 'number' && e.scale !== 1) e.preventDefault();
}, {
    passive: false
});

(function() {
    let lastTouch = 0;
    document.addEventListener('touchend', function(e) {
        const now = Date.now();
        const dt = now - lastTouch;
        if (dt > 0 && dt <= 300) e.preventDefault();
        lastTouch = now;
    }, {
        passive: false
    });
})();

window.addEventListener('wheel', function(e) {
    if (e.ctrlKey) e.preventDefault();
}, {
    passive: false
});

// --- INICIALIZACIÓN FINAL: CARGAR DATOS Y MOSTRAR ADMIN ---
cargarDatos();
renderPalabras();
renderJugadores();
mostrarSeccion('admin');