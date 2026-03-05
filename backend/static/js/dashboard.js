function toggleProfileMenu() {
    const menu = document.getElementById('profileDropdown');
    menu.classList.toggle('show');
}

// Cerrar el menú si haces clic fuera de él
window.onclick = function(event) {
    if (!event.target.matches('.profile-circle') && !event.target.matches('.profile-circle img')) {
        const dropdowns = document.getElementsByClassName("profile-dropdown");
        for (let i = 0; i < dropdowns.length; i++) {
            let openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}

// --- LOGOUT ---
function handleLogout() {
    localStorage.removeItem('user_email');
    window.location.href = "/";
}

// --- BUSCADOR ---
function handleSearch() {
    const query = document.getElementById('global-search').value.toLowerCase();
    const rows = document.querySelectorAll('.geofence-row'); // Usamos la clase de tus nuevos rectángulos

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // 1. Quitar la clase 'active' de todos los botones
            navLinks.forEach(item => item.classList.remove('active'));

            // 2. Agregar la clase 'active' al botón presionado
            this.classList.add('active');
            
            // Nota: Si el enlace redirige a otra página, el estado se perderá 
            // a menos que la nueva página detecte su propia URL.
        });
    });
});