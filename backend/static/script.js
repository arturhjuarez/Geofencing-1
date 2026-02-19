const textElement = document.getElementById('typewriter-text');
const text = "Geofencing";
let index = 0;

function type() {
    if (index < text.length) {
        textElement.textContent += text.charAt(index);
        index++;
        setTimeout(type, 50); // Velocidad de escritura
    }
}

document.addEventListener('DOMContentLoaded', type);

const API_URL = "http://127.0.0.1:5000/api";

        async function handleLogin() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            showMessage("Conectando...", "black");
//---------------------------------------------------------------------
            const adminUser = "admin@geotracker.com";
            const adminPass = "12345";

            if (email === adminUser && password === adminPass) {
        showMessage("¡Acceso de prueba correcto! Redirigiendo...", "green");
        
        localStorage.setItem('user_email', email);
        
        setTimeout(() => {
            window.location.href = "/dashboard"; // Te manda al mapa
        }, 1000);
    }
//--------------------------------------------------------------------
            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();

                if (response.ok) {
                    showMessage("¡Bienvenido! Redirigiendo...", "green");
                    // Guardamos el usuario en el navegador
                    localStorage.setItem('user_email', data.email);
                    setTimeout(() => {
                        window.location.href = "/dashboard"; // Te manda al mapa
                    }, 1000);
                } else {
                    showMessage(data.message, "red");
                }
            } catch (error) {
                showMessage("Error de conexión con el servidor", "red");
            }
        }

        async function handleRegister() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if(!email || !password) {
                showMessage("Llena ambos campos por favor", "red");
                return;
            }

            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();

                if (response.ok) {
                    showMessage("¡Cuenta creada! Ahora inicia sesión.", "green");
                } else {
                    showMessage("Error: " + data.message, "red");
                }
            } catch (error) {
                showMessage("Error al intentar registrar", "red");
            }
        }

        function showMessage(text, color) {
            const msgDiv = document.getElementById('msg');
            msgDiv.innerText = text;
            msgDiv.style.color = color;
        }


document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault(); 
    handleLogin();          
});

// ARTURO
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const datos = {
            nombre: document.getElementById('reg-nombre').value,
            paterno: document.getElementById('reg-paterno').value,
            materno: document.getElementById('reg-materno').value,
            telefono: document.getElementById('reg-tel').value,
            email: document.getElementById('reg-email').value,
            password: document.getElementById('reg-password').value
        };

        showMessage("Creando cuenta...", "black");

        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });
            
            const resData = await response.json();

            if (response.ok) {
                showMessage("¡Cuenta creada con éxito! Redirigiendo...", "green");
                setTimeout(() => { window.location.href = "/"; }, 2000);
            } else {
                showMessage("Error: " + resData.message, "red");
            }
        } catch (error) {
            showMessage("Error de conexión", "red");
        }
    });
}