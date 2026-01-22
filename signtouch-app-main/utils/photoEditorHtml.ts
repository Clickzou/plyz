// HTML complet de l'éditeur photo avec Fabric.js
// Version synchronisée avec web/photo-editor.html pour avoir les mêmes filtres sur toutes les plateformes

export const PHOTO_EDITOR_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Photo Editor</title>

    <!-- Fabric.js CDN - Utiliser jsDelivr qui est plus stable sur mobile -->
    <script src="https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js"></script>

    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #000;
            overflow: hidden;
            width: 100vw;
            height: 100vh;
            position: fixed;
        }

        #canvas-container {
            position: fixed;
            top: 96px;
            left: 0;
            right: 0;
            bottom: 140px;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #000;
        }

        canvas {
            max-width: 100%;
            max-height: 100%;
            display: block;
        }

        .top-actions {
            position: fixed;
            top: 20px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            padding: 0 20px;
            z-index: 1000;
        }

        .btn-action {
            width: 56px;
            height: 56px;
            border-radius: 28px;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            font-size: 24px;
            color: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .btn-action:active {
            transform: scale(0.95);
        }

        .btn-cancel {
            background: #ef4444;
        }

        .btn-reset {
            background: #f59e0b;
        }

        .btn-validate {
            background: #10b981;
        }

        .filters-bar {
            position: fixed;
            bottom: 20px;
            left: 0;
            right: 0;
            z-index: 1000;
            padding: 0 20px;
        }

        .filters-scroll {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding: 10px 0;
        }

        .filters-scroll::-webkit-scrollbar {
            display: none;
        }

        .filter-btn {
            flex: 0 0 auto;
            padding: 12px 20px;
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            backdrop-filter: blur(10px);
        }

        .filter-btn:active {
            transform: scale(0.95);
        }

        .filter-btn.active {
            background: rgba(16, 185, 129, 0.3);
            border-color: #10b981;
            color: #10b981;
        }

        .loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 2000;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(16, 185, 129, 0.2);
            border-top-color: #10b981;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div id="loading" class="loading hidden">
        <div class="spinner"></div>
    </div>

    <div class="top-actions">
        <button class="btn-action btn-cancel" id="btn-cancel" title="Annuler">✕</button>
        <button class="btn-action btn-reset" id="btn-reset" title="Réinitialiser">↻</button>
        <button class="btn-action btn-validate" id="btn-validate" title="Valider">✓</button>
    </div>

    <div id="canvas-container">
        <canvas id="canvas"></canvas>
    </div>

    <div class="filters-bar">
        <div class="filters-scroll" id="filters-scroll"></div>
    </div>

    <script>
        let canvas;
        let originalImage = null;
        let currentFilter = 'none';

        const FILTERS = [
            { id: 'none', name: 'Aucun' },
            { id: 'grayscale', name: 'Noir & Blanc' },
            { id: 'sepia', name: 'Sepia' },
            { id: 'vintage', name: 'Vintage' },
            { id: 'contrast', name: 'Contraste+' },
            { id: 'brightness', name: 'Lumineux' },
            { id: 'saturation', name: 'Saturation+' },
            { id: 'desaturate', name: 'Désaturé' },
            { id: 'blur', name: 'Flou' },
            { id: 'sharpen', name: 'Netteté' },
            { id: 'emboss', name: 'Emboss' },
            { id: 'pixelate', name: 'Pixelate' },
            { id: 'invert', name: 'Inverser' },
            { id: 'noise', name: 'Grain' },
            { id: 'technicolor', name: 'Technicolor' },
            { id: 'polaroid', name: 'Polaroid' },
            { id: 'kodachrome', name: 'Kodachrome' },
            { id: 'cartoon', name: '🎨 Cartoon' },
            { id: 'sketch', name: '✏️ Croquis' },
            { id: 'watercolor', name: '🖌️ Aquarelle' },
        ];

        window.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [WebView HTML] Photo Editor - DOMContentLoaded');

            if (typeof fabric === 'undefined') {
                console.error('❌ [WebView HTML] Fabric.js non chargé!');
                alert('Erreur: Fabric.js ne s\\'est pas chargé. Vérifiez votre connexion internet.');
                return;
            }

            console.log('✅ [WebView HTML] Fabric.js version:', fabric.version);

            initCanvas();
            initFiltersButtons();
            initActionButtons();

            console.log('✅ [WebView HTML] Ajout des listeners de messages');
            window.addEventListener('message', handleMessage);
            document.addEventListener('message', handleMessage);

            console.log('📤 [WebView HTML] Envoi du message ready à React Native');
            sendMessageToApp({ action: 'ready' });
        });

        function initCanvas() {
            canvas = new fabric.Canvas('canvas', {
                selection: false,
                backgroundColor: '#000'
            });

            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
        }

        function resizeCanvas() {
            const container = document.getElementById('canvas-container');
            const maxWidth = container.clientWidth;
            const maxHeight = container.clientHeight - 180;

            if (canvas && originalImage) {
                const img = originalImage;
                const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

                canvas.setWidth(img.width * scale);
                canvas.setHeight(img.height * scale);
                canvas.setZoom(scale);
                canvas.renderAll();
            }
        }

        function initFiltersButtons() {
            const filtersScroll = document.getElementById('filters-scroll');

            FILTERS.forEach(filter => {
                const btn = document.createElement('button');
                btn.className = 'filter-btn';
                btn.id = 'filter-' + filter.id;
                btn.textContent = filter.name;
                btn.dataset.filterId = filter.id;

                if (filter.id === 'none') {
                    btn.classList.add('active');
                }

                btn.addEventListener('click', () => applyFilter(filter.id));
                filtersScroll.appendChild(btn);
            });
        }

        function initActionButtons() {
            document.getElementById('btn-cancel').addEventListener('click', handleCancel);
            document.getElementById('btn-reset').addEventListener('click', handleReset);
            document.getElementById('btn-validate').addEventListener('click', handleValidate);
        }

        function handleMessage(event) {
            try {
                console.log('📨 [WebView HTML] handleMessage appelé, event.data:', event.data);
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                console.log('📨 [WebView HTML] Message parsé:', data);

                if (data.action === 'loadImage' && data.imageUri) {
                    console.log('🖼️ [WebView HTML] Action loadImage détectée avec URI:', data.imageUri.substring(0, 50) + '...');
                    loadImage(data.imageUri);
                } else if (data.action === 'loadImage') {
                    console.error('❌ [WebView HTML] Action loadImage reçue mais imageUri manquant!');
                } else {
                    console.log('ℹ️ [WebView HTML] Action non gérée:', data.action);
                }
            } catch (error) {
                console.error('❌ [WebView HTML] Erreur message:', error);
            }
        }

        function loadImage(imageUri) {
            showLoading(true);
            console.log('📸 [WebView HTML] loadImage appelé avec URI:', imageUri.substring(0, 100) + '...');

            if (!imageUri) {
                console.error('❌ [WebView HTML] imageUri est vide!');
                alert('Aucune image à charger');
                showLoading(false);
                return;
            }

            // Validation : l'URI DOIT être data:image/ ou http(s)://
            if (!imageUri.startsWith('data:image/') && !imageUri.startsWith('http://') && !imageUri.startsWith('https://')) {
                console.error('❌ [WebView HTML] URI invalide:', imageUri.substring(0, 100));
                alert('Format d\\'image non supporté. L\\'URI doit être data:image/ ou http(s)://');
                showLoading(false);
                return;
            }

            console.log('🔄 [WebView HTML] Appel de fabric.Image.fromURL...');
            fabric.Image.fromURL(imageUri, (img) => {
                console.log('📥 [WebView HTML] Callback fromURL reçu, img:', img);

                // Validation stricte de l'image chargée
                if (!img) {
                    console.error('❌ Impossible de charger l\\'image (objet nul)');
                    alert('Impossible de charger l\\'image (objet nul)');
                    showLoading(false);
                    return;
                }

                if (!img.width || !img.height || img.width === 0 || img.height === 0) {
                    console.error('❌ Impossible de charger l\\'image (largeur/hauteur nulles):', img.width, 'x', img.height);
                    alert('Impossible de charger l\\'image (largeur/hauteur nulles)');
                    showLoading(false);
                    return;
                }

                originalImage = img;
                console.log('✅ [WebView HTML] Image chargée:', img.width, 'x', img.height);

                // Récupérer la taille exacte du conteneur
                const container = document.getElementById('canvas-container');
                if (!container) {
                    alert('Conteneur canvas introuvable');
                    showLoading(false);
                    return;
                }
                const canvasWidth = container.clientWidth;
                const canvasHeight = container.clientHeight;

                canvas.setWidth(canvasWidth);
                canvas.setHeight(canvasHeight);
                canvas.setZoom(1); // Pas de zoom global

                // Calcul du facteur d'échelle en mode COVER (remplir l'espace)
                const scaleX = canvasWidth / img.width;
                const scaleY = canvasHeight / img.height;
                let scale = Math.max(scaleX, scaleY); // COVER au lieu de FIT

                if (!isFinite(scale) || scale <= 0) {
                    console.warn('⚠️ Scale invalide, utilisation de 1:', scale);
                    scale = 1;
                }

                console.log('📐 [WebView HTML] Canvas:', canvasWidth, 'x', canvasHeight, '- Image:', img.width, 'x', img.height, '- Scale:', scale);

                // Calculer les dimensions de l'image après scaling
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;

                // Calculer la position pour centrer l'image
                const left = (canvasWidth - scaledWidth) / 2;
                const top = (canvasHeight - scaledHeight) / 2;

                console.log('📍 [WebView HTML] Position - left:', left, 'top:', top, 'scaledSize:', scaledWidth, 'x', scaledHeight);

                // Scale et centrage simple avec left/top
                img.scale(scale);
                img.set({
                    left: left,
                    top: top,
                    originX: 'left',
                    originY: 'top',
                    selectable: false,
                    evented: false,
                    hasControls: false,
                    hasBorders: false,
                    lockMovementX: true,
                    lockMovementY: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    lockRotation: true,
                });

                // Nettoyer le canvas et ajouter l'image
                canvas.clear();
                canvas.add(img);
                canvas.setActiveObject(img);
                canvas.selection = false;
                canvas.renderAll();

                console.log('✅ [WebView HTML] Image affichée dans le canvas');
                showLoading(false);
            }, {
                crossOrigin: 'anonymous'
            });
        }

        function applyFilter(filterId) {
            if (!originalImage) {
                console.warn('⚠️ Aucune image chargée');
                return;
            }

            showLoading(true);
            console.log('🎨 Application du filtre:', filterId);

            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById('filter-' + filterId).classList.add('active');

            currentFilter = filterId;

            // Retirer tous les filtres et forcer le rendu de l'image originale
            originalImage.filters = [];

            // Pour "none", appliquer immédiatement sans filtre
            if (filterId === 'none') {
                originalImage.applyFilters();
                canvas.renderAll();
                console.log('✅ Reset complet : image originale sans filtre');
                showLoading(false);
                return;
            }

            switch (filterId) {
                case 'grayscale':
                    originalImage.filters.push(new fabric.Image.filters.Grayscale());
                    break;

                case 'sepia':
                    originalImage.filters.push(new fabric.Image.filters.Sepia());
                    break;

                case 'vintage':
                    originalImage.filters.push(new fabric.Image.filters.Sepia());
                    originalImage.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.15 }));
                    originalImage.filters.push(new fabric.Image.filters.Noise({ noise: 100 }));
                    break;

                case 'contrast':
                    originalImage.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.3 }));
                    break;

                case 'brightness':
                    originalImage.filters.push(new fabric.Image.filters.Brightness({ brightness: 0.2 }));
                    break;

                case 'saturation':
                    originalImage.filters.push(new fabric.Image.filters.Saturation({ saturation: 0.5 }));
                    break;

                case 'desaturate':
                    originalImage.filters.push(new fabric.Image.filters.Saturation({ saturation: -0.7 }));
                    break;

                case 'blur':
                    originalImage.filters.push(new fabric.Image.filters.Blur({ blur: 0.3 }));
                    break;

                case 'sharpen':
                    originalImage.filters.push(new fabric.Image.filters.Convolute({
                        matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0]
                    }));
                    break;

                case 'emboss':
                    originalImage.filters.push(new fabric.Image.filters.Convolute({
                        matrix: [1, 1, 1, 1, 0.7, -1, -1, -1, -1]
                    }));
                    break;

                case 'pixelate':
                    originalImage.filters.push(new fabric.Image.filters.Pixelate({ blocksize: 8 }));
                    break;

                case 'invert':
                    originalImage.filters.push(new fabric.Image.filters.Invert());
                    break;

                case 'noise':
                    originalImage.filters.push(new fabric.Image.filters.Noise({ noise: 200 }));
                    break;

                case 'technicolor':
                    originalImage.filters.push(new fabric.Image.filters.Technicolor());
                    break;

                case 'polaroid':
                    originalImage.filters.push(new fabric.Image.filters.Polaroid());
                    break;

                case 'kodachrome':
                    originalImage.filters.push(new fabric.Image.filters.Kodachrome());
                    break;

                case 'cartoon':
                    // 🎨 EFFET CARTOON (Dessin animé)
                    // Combinaison de filtres pour créer un rendu stylisé comme un dessin animé :
                    // 1. Contraste élevé (0.5) : crée des séparations nettes entre zones claires et sombres
                    // 2. Saturation augmentée (0.7) : rend les couleurs vives et éclatantes comme dans les cartoons
                    // 3. Brightness légèrement augmentée (0.15) : éclaircit l\\'image pour un aspect plus "pop"
                    // Le résultat : contours nets + couleurs vibrantes = style dessin animé
                    originalImage.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.5 }));
                    originalImage.filters.push(new fabric.Image.filters.Saturation({ saturation: 0.7 }));
                    originalImage.filters.push(new fabric.Image.filters.Brightness({ brightness: 0.15 }));
                    break;

                case 'sketch':
                    // ✏️ EFFET CROQUIS (Dessin au crayon)
                    // Combinaison pour simuler un dessin au crayon sur papier :
                    // 1. Grayscale : convertit en noir et blanc (base du croquis)
                    // 2. Contraste très élevé (0.8) : accentue les contours et les zones d\\'ombre
                    // 3. Brightness réduite (-0.1) : assombrit légèrement pour effet crayon graphite
                    // 4. Convolute avec matrice edge detection : détecte et renforce les contours
                    //    La matrice [-1,-1,-1,-1,8,-1,-1,-1,-1] fait ressortir les lignes comme un trait de crayon
                    originalImage.filters.push(new fabric.Image.filters.Grayscale());
                    originalImage.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.8 }));
                    originalImage.filters.push(new fabric.Image.filters.Brightness({ brightness: -0.1 }));
                    originalImage.filters.push(new fabric.Image.filters.Convolute({
                        matrix: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
                    }));
                    break;

                case 'watercolor':
                    // 🖌️ EFFET AQUARELLE (Peinture à l\\'eau)
                    // Combinaison pour créer un effet de peinture avec couleurs qui se diffusent :
                    // 1. Blur (0.4) : crée un effet de diffusion des couleurs comme l\\'eau sur le papier
                    // 2. Saturation augmentée (0.4) : intensifie les couleurs pour un rendu pictural
                    // 3. Brightness légèrement réduite (-0.05) : donne plus de profondeur aux pigments
                    // 4. Contrast modéré (0.2) : adoucit les transitions tout en gardant de la définition
                    // Le résultat : couleurs douces et diffuses qui se mélangent comme une vraie aquarelle
                    originalImage.filters.push(new fabric.Image.filters.Blur({ blur: 0.4 }));
                    originalImage.filters.push(new fabric.Image.filters.Saturation({ saturation: 0.4 }));
                    originalImage.filters.push(new fabric.Image.filters.Brightness({ brightness: -0.05 }));
                    originalImage.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.2 }));
                    break;
            }

            originalImage.applyFilters();
            canvas.renderAll();

            console.log('✅ Filtre appliqué:', filterId);
            showLoading(false);
        }

        function handleCancel() {
            console.log('❌ Annulation');
            sendMessageToApp({ action: 'cancel' });
        }

        function handleReset() {
            console.log('↻ Réinitialisation');
            applyFilter('none');
        }

        function handleValidate() {
            if (!originalImage) {
                console.warn('⚠️ Aucune image à valider');
                return;
            }

            showLoading(true);
            console.log('✅ Validation en cours...');

            try {
                const dataURL = canvas.toDataURL({
                    format: 'jpeg',
                    quality: 0.9
                });

                console.log('✅ Image exportée (', (dataURL.length / 1024).toFixed(0), 'Ko)');

                sendMessageToApp({
                    action: 'validate',
                    imageData: dataURL,
                    filter: currentFilter
                });

                showLoading(false);
            } catch (error) {
                console.error('❌ Erreur export:', error);
                showLoading(false);
                alert('Erreur lors de l\\'export de l\\'image');
            }
        }

        function sendMessageToApp(message) {
            console.log('📤 Envoi message:', message);

            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify(message));
            } else if (window.parent !== window) {
                window.parent.postMessage(message, '*');
            } else {
                console.log('📤 Message (console):', message);
            }
        }

        function showLoading(show) {
            const loading = document.getElementById('loading');
            if (show) {
                loading.classList.remove('hidden');
            } else {
                loading.classList.add('hidden');
            }
        }

        console.log('🎨 Photo Editor prêt - Fabric.js');
    </script>
</body>
</html>`;
