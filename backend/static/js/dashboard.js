function toggleProfileMenu() {
    const menu = document.getElementById('profileDropdown');
    menu.classList.toggle('show');
}

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
    const rows = document.querySelectorAll('.geofence-row'); 

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            navLinks.forEach(item => item.classList.remove('active'));

            this.classList.add('active');
            
        });
    });
});
function viajarAlMapa(fila) {
            const coordenadasStr = fila.getAttribute('data-coords');
            
            localStorage.setItem('zonaParaDibujar', coordenadasStr);
            
            window.location.href = '/map';
        }

async function eliminarGeocerca(id_zona) {
    if (confirm("¿Estás seguro de que quieres eliminar esta geocerca? Esta acción no se puede deshacer.")) {
        try {
            const response = await fetch(`/api/delete_zone/${id_zona}`, {
                method: 'POST' 
            });
            
            if (response.ok) {
                window.location.reload();
            } else {
                alert("Error al intentar eliminar la zona en el servidor.");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Ocurrió un error de conexión con el servidor.");
        }
    }
}

        let zonaAEliminar = null;
        function eliminarGeocerca(id_zona) {
            zonaAEliminar = id_zona; 
            document.getElementById('deleteModal').style.display = 'flex'; 
        }

        function cerrarModal() {
            zonaAEliminar = null; 
            document.getElementById('deleteModal').style.display = 'none'; 
        }

        async function confirmarEliminacion() {
            if (!zonaAEliminar) return; 

            try {
                const response = await fetch(`/api/delete_zone/${zonaAEliminar}`, {
                    method: 'POST' 
                });
                
                if (response.ok) {
                    window.location.reload(); 
                } else {
                    alert("Error al intentar eliminar la zona.");
                    cerrarModal();
                }
            } catch (error) {
                console.error("Error:", error);
                alert("Ocurrió un error de conexión con el servidor.");
                cerrarModal();
            }
        }


const searchInput = document.getElementById('dash-search');

if (searchInput) {
    searchInput.addEventListener('input', function(evento) {
        const textoBuscado = evento.target.value.toLowerCase().trim();
        
        const filas = document.querySelectorAll('.table-body .table-row');

        filas.forEach(fila => {
            const elementoNombre = fila.querySelector('.col-name');
            
            if (elementoNombre) {
                const nombreGeocerca = elementoNombre.textContent.toLowerCase().trim();

                if (nombreGeocerca.startsWith(textoBuscado)) {
                    fila.style.display = 'flex';
                } else {
                    fila.style.display = 'none';
                }
            }
        });
    });
}