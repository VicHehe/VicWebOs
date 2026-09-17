// ============================================================
//  Widget: Reloj Mundial
// ============================================================

const CIUDADES = [
    { nombre: 'San Fernando', bandera: '🇨🇱', zona: 'America/Santiago' },
    { nombre: 'Mexicali',     bandera: '🇲🇽', zona: 'America/Tijuana' },
    { nombre: 'Madrid',       bandera: '🇪🇸', zona: 'Europe/Madrid' },
    { nombre: 'Nueva York',   bandera: '🇺🇸', zona: 'America/New_York' },
    { nombre: 'Tokio',        bandera: '🇯🇵', zona: 'Asia/Tokyo' }
];

function formatearHora(zona) {
    try {
        return new Date().toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: zona
        });
    } catch (e) {
        return '--:--';
    }
}

function render() {
    const cont = document.getElementById('rmLista');
    if (!cont) return;

    cont.innerHTML = CIUDADES.map(c => `
        <div class="rm-item">
            <span class="rm-ciudad">
                <span class="rm-bandera">${c.bandera}</span>
                ${c.nombre}
            </span>
            <span class="rm-hora" data-zona="${c.zona}">${formatearHora(c.zona)}</span>
        </div>
    `).join('');

    lucide.createIcons();
}

function tick() {
    document.querySelectorAll('.rm-hora').forEach(el => {
        const zona = el.dataset.zona;
        if (zona) el.textContent = formatearHora(zona);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    render();
    setInterval(tick, 1000);
});
