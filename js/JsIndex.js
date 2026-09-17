<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stor-He</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body>

    <div class="sh-header">
        <div class="sh-header-top">
            <div class="sh-logo">
                <div class="sh-logo-mark">
                    <i data-lucide="store"></i>
                </div>
                <div class="sh-logo-text">
                    <h1>Stor-He</h1>
                    <p>Descarga apps, temas y widgets para tu VicWebOs</p>
                </div>
            </div>
        </div>

        <div class="sh-tabs">
            <button class="sh-tab active" data-tab="apps">
                <i data-lucide="package"></i>
                <span>Apps</span>
                <span class="sh-tab-count" id="countApps">0</span>
            </button>
            <button class="sh-tab" data-tab="temas">
                <i data-lucide="palette"></i>
                <span>Temas</span>
                <span class="sh-tab-count" id="countTemas">0</span>
            </button>
            <button class="sh-tab" data-tab="widgets">
                <i data-lucide="layout-grid"></i>
                <span>Widgets</span>
                <span class="sh-tab-count" id="countWidgets">0</span>
            </button>
        </div>
    </div>

    <div class="sh-content">

        <!-- ===== TAB APPS ===== -->
        <section class="sh-panel active" data-panel="apps">
            <div id="appsContenido"></div>
        </section>

        <!-- ===== TAB TEMAS ===== -->
        <section class="sh-panel" data-panel="temas">
            <div id="temasContenido"></div>
        </section>

        <!-- ===== TAB WIDGETS ===== -->
        <section class="sh-panel" data-panel="widgets">
            <div id="widgetsContenido"></div>
        </section>

    </div>

    <div class="sh-toast" id="shToast"></div>

    <script src="stor-he.js"></script>
    <script>lucide.createIcons();</script>
</body>
</html>
