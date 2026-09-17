// ============================================================
//  MobileUI.js — Drawer lateral + detalles de UI móvil
//  ------------------------------------------------------------
//  En desktop no hace absolutamente nada (todo está oculto por CSS).
//  En móvil (≤ 768px):
//    - El botón hamburguesa abre la sidebar como drawer.
//    - El overlay, la tecla ESC o pulsar un nav-item la cierran.
//    - Al rotar a horizontal / ensanchar, se cierra sola.
// ============================================================

(function () {
    'use strict';

    const BREAKPOINT = 768;

    let btn       = null;
    let sidebar   = null;
    let overlay   = null;
    let closeBtn  = null;

    function abrir() {
        if (!sidebar || !overlay) return;
        sidebar.classList.add('show');
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function cerrar() {
        if (!sidebar || !overlay) return;
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    }

    function toggle() {
        if (sidebar.classList.contains('show')) cerrar();
        else abrir();
    }

    function inicializar() {
        btn      = document.getElementById('mobileMenuBtn');
        sidebar  = document.querySelector('.sidebar');
        overlay  = document.getElementById('sidebarOverlay');
        closeBtn = document.getElementById('sidebarCloseBtn');

        if (!btn || !sidebar || !overlay) return;

        btn.addEventListener('click', toggle);
        overlay.addEventListener('click', cerrar);
        if (closeBtn) closeBtn.addEventListener('click', cerrar);

        // Cerrar tras pulsar un nav-item (delegado, porque se re-renderiza)
        sidebar.addEventListener('click', (e) => {
            if (e.target.closest('.nav-item')) {
                // Pequeño delay para que se vea el feedback del tap
                setTimeout(cerrar, 120);
            }
        });

        // ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('show')) cerrar();
        });

        // Si se agranda la ventana, cerrar el drawer
        window.addEventListener('resize', () => {
            if (window.innerWidth > BREAKPOINT && sidebar.classList.contains('show')) {
                cerrar();
            }
        });

        // Evitar que un scroll del fondo mueva la página con el drawer abierto
        sidebar.addEventListener('touchmove', (e) => {
            // Solo bloquear si el scroll no viene de un elemento scrolleable interno
            if (!e.target.closest('.sidebar-nav')) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    // Exponer por si alguna app necesita abrirlo/cerrarlo
    window.__mobileUI = { abrir, cerrar, toggle };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }
})();
