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

const API_URL = "http://localhost:5000/api";
//const API_URL = "http://127.0.0.1:5000/api";

        async function handleLogin() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            showMessage("Conectando...", "black");
            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: "include", 
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();

                if (response.ok) {
                    showMessage("¡Bienvenido! Redirigiendo...", "green");
                    // Guardamos el usuario en el navegador
                    localStorage.setItem('user_email', data.email);
                    setTimeout(() => {
                        window.location.href = "/profile"; // Te manda al perfil
                    }, 1000);
                } else {
                    showMessage(data.message, "red");
                }
            } catch (error) {
                showMessage("Error de conexión con el servidor", "red");
            }
        }
        

// -----------FUNCION DE CAPTURA DE DATOS EN REGISTRO------------//        
        async function handleRegister() {
            const nombre = document.getElementById('nombre').value;
            const paterno = document.getElementById('paterno').value;
            const materno = document.getElementById('materno').value;
            const telefono = document.getElementById('telefono').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // 2. Validación básica
            if(!nombre || !email || !password) {
                showMessage("Por favor, llena los campos obligatorios", "red");
                return;
            }

            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: "include", 
                    // 3. Enviamos TODO a Python
                    body: JSON.stringify({ 
                        nombre, 
                        paterno, 
                        materno, 
                        telefono, 
                        email, 
                        password 
                    })
                });
                
                const data = await response.json();

                if (response.ok) {
                    showMessage("¡Cuenta creada en R2-D2! Redirigiendo...", "green");
                    setTimeout(() => { window.location.href = "/"; }, 1500);
                } else {
                    showMessage("Error: " + (data.message || "No se pudo registrar"), "red");
                }
            } catch (error) {
                showMessage("Error de conexión con el servidor", "red");
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
                credentials: "include", 
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