/* ═══════════════════════════════════════════════════════════
   Coulombic Field & Vector Analyst — Application Engine v2
   ═══════════════════════════════════════════════════════════ */

(() => {
    'use strict';

    // ─── Constants ───
    const K = 8.9875e9;                     // Coulomb constant (N·m²/C²)
    const PIXELS_PER_METER = 600;           // scale factor
    const FIELD_LINE_STEP = 3;              // px per integration step
    const FIELD_LINE_MAX_STEPS = 800;       // max steps per line
    const FIELD_LINE_COUNT = 14;            // lines per charge
    const MAX_LOG_ROWS = 50;
    const DOT_GRID_SPACING = 32;
    const CHARGE_RADIUS = 28;              // visual radius of charge circles

    // ─── State ───
    let charges = [];
    let focusPair = [null, null]; // pair shown in sidebar telemetry (closest or dragged)
    let dataLog = [];
    let graphPoints = [];
    let savedReadings = [];  // snapshots: { id, chargesSnapshot, solutionHTML }
    let draggingCharge = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let selectedMagnitude = 5; // μC
    let showFieldLines = false;
    let showForceArrows = true;
    let showSciNotation = true;
    let isAtomicMode = false;
    let nextChargeId = 1;
    let aiFeedbackAnimating = false;
    let aiActionToastTimer = null;
    let aiPastedImageDataUrl = null;
    let lockedPairIds = []; // manual pair lock: [chargeId1, chargeId2]
    let pairSelectionBuffer = []; // stores clicked charge ids until pair lock is complete
    let pointerDownChargeId = null;
    let pointerDragMoved = false;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let quizState = null; // { expectedForceN, questionText }
    let isExportingPdf = false;
    let activeReadingId = null;
    let exportDonePopupTimer = null;
    const SOLUTION_CLOSE_ANIM_MS = 220;
    const recentChargeUpdates = new Map(); // chargeId -> expiry timestamp

    // ─── DOM Elements ───
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const graphCanvasEl = document.getElementById('graphCanvas');
    const graphCtx = graphCanvasEl.getContext('2d');
    const emptyState = document.getElementById('emptyState');
    const chargeCardsContainer = document.getElementById('chargeCardsContainer');
    const dataLogBody = document.getElementById('dataLogBody');
    const entryCount = document.getElementById('entryCount');
    const canvasOffsetEl = document.getElementById('canvasOffset');
    const physicsPanel = document.getElementById('physicsPanel');
    const bottomPanels = document.getElementById('bottomPanels');

    // Telemetry displays
    const valSeparation = document.getElementById('valSeparation');
    const valForce = document.getElementById('valForce');
    const valDirection = document.getElementById('valDirection');
    const valPotential = document.getElementById('valPotential');

    // Slider + Input
    const chargeSlider = document.getElementById('chargeSlider');
    const chargeInput = document.getElementById('chargeInput');

    // Physics AI
    const aiFloatingLauncher = document.getElementById('aiFloatingLauncher');
    const aiChatWidget = document.getElementById('aiChatWidget');
    const btnCloseAIChat = document.getElementById('btnCloseAIChat');
    const aiPromptInput = document.getElementById('aiPromptInput');
    const aiPresetSelect = document.getElementById('aiPresetSelect');
    const aiSimulationSelect = document.getElementById('aiSimulationSelect');
    const btnSolveProblem = document.getElementById('btnSolveProblem');
    const btnAskAI = document.getElementById('btnAskAI');
    const aiImageAttachment = document.getElementById('aiImageAttachment');
    const aiImageAttachmentLabel = document.getElementById('aiImageAttachmentLabel');
    const btnClearAIImage = document.getElementById('btnClearAIImage');
    const aiStatus = document.getElementById('aiStatus');
    const aiResponse = document.getElementById('aiResponse');
    const btnUnlockPair = document.getElementById('btnUnlockPair');
    const btnExportSolutionPdf = document.getElementById('btnExportSolutionPdf');
    const btnCloseSolutionBottom = document.getElementById('btnCloseSolutionBottom');
    const exportPickerOverlay = document.getElementById('exportPickerOverlay');
    const exportReadingList = document.getElementById('exportReadingList');
    const exportPickerError = document.getElementById('exportPickerError');
    const btnCloseExportPicker = document.getElementById('btnCloseExportPicker');
    const btnCancelExportPicker = document.getElementById('btnCancelExportPicker');
    const btnConfirmExportReadings = document.getElementById('btnConfirmExportReadings');
    const exportProgressOverlay = document.getElementById('exportProgressOverlay');
    const exportDonePopup = document.getElementById('exportDonePopup');
    const exportDoneText = document.getElementById('exportDoneText');
    const landingFront = document.getElementById('landingFront');
    const btnEnterLab = document.getElementById('btnEnterLab');
    const btnMainTutorial = document.getElementById('btnMainTutorial');
    const coachTourOverlay = document.getElementById('coachTourOverlay');
    const coachTourSpotlight = document.getElementById('coachTourSpotlight');
    const coachTourMouse = document.getElementById('coachTourMouse');
    const coachTourCard = document.getElementById('coachTourCard');
    const coachTourProgress = document.getElementById('coachTourProgress');
    const coachTourTitle = document.getElementById('coachTourTitle');
    const coachTourBody = document.getElementById('coachTourBody');
    const coachTourChecklist = document.getElementById('coachTourChecklist');
    const btnCoachPrev = document.getElementById('btnCoachPrev');
    const btnCoachSkip = document.getElementById('btnCoachSkip');
    const btnCoachNext = document.getElementById('btnCoachNext');
    const btnCoachFinish = document.getElementById('btnCoachFinish');
    const AI_ENDPOINT = 'http://localhost:8787/api/ai';

    // ═══════════════════ INITIALIZATION ═══════════════════

    function init() {
        resizeCanvases();
        setupEventListeners();
        setupInAppCoachTour();
        setupLandingFrontPage();
        addDefaultCharges();
        refreshAISimulationOptions();
        updateAIPresetInputs();
        render();
    }

    function setupInAppCoachTour() {
        if (!coachTourOverlay || !coachTourSpotlight || !coachTourMouse || !coachTourCard || !coachTourProgress || !coachTourTitle || !coachTourBody || !coachTourChecklist || !btnCoachPrev || !btnCoachSkip || !btnCoachNext || !btnCoachFinish) {
            return;
        }

        const doneKey = 'coulombic_in_app_tour_done';
        const tourSteps = [
            {
                selector: '#btnToggleFeatures',
                title: 'Tour Navigation',
                body: 'Use the Features button to open or collapse the controls panel anytime.',
                bullets: [
                    'Keep it open while you configure experiments.',
                    'Collapse it for a wider canvas view.',
                    'The tutorial will now guide key controls in sequence.'
                ],
            },
            {
                selector: '#btnAddPositive',
                title: 'Add Charges',
                body: 'Start by adding positive and negative charges from the controls panel.',
                bullets: [
                    'Use + Charge and - Charge to place particles.',
                    'Each click adds one draggable charge to the canvas.',
                    'Mix signs to produce attraction and repulsion cases.'
                ],
            },
            {
                selector: '#chargeSlider',
                title: 'Set Magnitude',
                body: 'Adjust charge strength before adding more particles.',
                bullets: [
                    'Slider and input stay synchronized.',
                    'Value is in microcoulombs.',
                    'Atomic mode gives tiny realistic values.'
                ],
            },
            {
                selector: '#simulationCanvas',
                title: 'Interact on Canvas',
                body: 'Drag charges to change separation distance and force behavior in real time.',
                bullets: [
                    'Watch arrows and labels update as you move charges.',
                    'Distance drives force magnitude by inverse-square relation.',
                    'Use this area for visual intuition.'
                ],
            },
            {
                selector: '#btnSaveReading',
                title: 'Save Reading',
                body: 'Capture the current setup and computed values into the data log.',
                bullets: [
                    'Each save stores pair calculations.',
                    'Saved readings can be restored from the table.',
                    'Also feeds the graph and report export.'
                ],
            },
            {
                selector: '#aiFloatingLauncher',
                title: 'Use the AI Assistant',
                body: 'This guided AI area helps you summarize, explain, and quiz your simulation results.',
                bullets: [
                    'Click Physics Assistant to open the AI panel.',
                    'Choose an action from the first dropdown (summary, explain, or quiz).',
                    'If required, pick a simulation, then click the Run button (play icon).',
                    'Read results in the assistant message area and repeat with another action.'
                ],
            },
            {
                selector: '#dataLogTable',
                title: 'Review Data Log',
                body: 'Use the log to compare runs and return to previous saved snapshots.',
                bullets: [
                    'Rows show pair values, distance, force, and interaction type.',
                    'Click a row to restore that reading.',
                    'Use multiple readings for PDF export selection.'
                ],
            },
            {
                selector: '#graphCanvas',
                title: 'Read the Graph',
                body: 'Compare measured force points against the theoretical F vs r curve.',
                bullets: [
                    'Dots represent saved simulations.',
                    'Dashed line is the theoretical trend.',
                    'Use this to validate your setup behavior.'
                ],
            },
        ];

        let activeSteps = [];
        let activeIndex = 0;
        let overlayOpen = false;

        const isVisibleTarget = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            return r.width > 8 && r.height > 8;
        };

        const getTargetRect = (selector) => {
            const target = document.querySelector(selector);
            if (!isVisibleTarget(target)) return null;
            return target.getBoundingClientRect();
        };

        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

        const playCoachFinishAnimation = () => {
            document.body.classList.add('coach-tour-finish-glow');

            const burst = document.createElement('div');
            burst.className = 'coach-tour-finish-burst';
            burst.innerHTML = '<div class="coach-tour-finish-badge"><span class="material-symbols-outlined">task_alt</span><strong>Tutorial Complete</strong></div><span class="coach-tour-spark coach-tour-spark--a"></span><span class="coach-tour-spark coach-tour-spark--b"></span><span class="coach-tour-spark coach-tour-spark--c"></span><span class="coach-tour-spark coach-tour-spark--d"></span>';
            document.body.appendChild(burst);

            window.setTimeout(() => {
                document.body.classList.remove('coach-tour-finish-glow');
            }, 700);

            window.setTimeout(() => {
                burst.remove();
            }, 1150);
        };

        const renderCoachStep = () => {
            if (!overlayOpen || activeSteps.length === 0) return;

            const step = activeSteps[activeIndex];
            const rect = getTargetRect(step.selector);
            if (!rect) {
                if (activeIndex < activeSteps.length - 1) {
                    activeIndex += 1;
                    renderCoachStep();
                }
                return;
            }

            const target = document.querySelector(step.selector);
            if (target && step.selector !== '#simulationCanvas') {
                target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
            }

            const pad = 8;
            const left = rect.left - pad;
            const top = rect.top - pad;
            const width = rect.width + pad * 2;
            const height = rect.height + pad * 2;

            coachTourSpotlight.style.left = `${left}px`;
            coachTourSpotlight.style.top = `${top}px`;
            coachTourSpotlight.style.width = `${width}px`;
            coachTourSpotlight.style.height = `${height}px`;

            const mouseX = rect.left + Math.min(Math.max(rect.width * 0.72, 18), rect.width - 10);
            const mouseY = rect.top + Math.min(Math.max(rect.height * 0.62, 18), rect.height - 10);
            coachTourMouse.style.left = `${mouseX}px`;
            coachTourMouse.style.top = `${mouseY}px`;

            coachTourProgress.textContent = `Step ${activeIndex + 1} of ${activeSteps.length}`;
            coachTourTitle.textContent = step.title;
            coachTourBody.textContent = step.body;
            coachTourChecklist.innerHTML = step.bullets.map((item) => `<li>${item}</li>`).join('');

            btnCoachPrev.disabled = activeIndex === 0;
            const isLast = activeIndex === activeSteps.length - 1;
            btnCoachNext.style.display = isLast ? 'none' : 'inline-flex';
            btnCoachFinish.style.display = isLast ? 'inline-flex' : 'none';

            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const cardRect = coachTourCard.getBoundingClientRect();
            let cardTop = rect.bottom + 14;
            if (cardTop + cardRect.height > vh - 10) {
                cardTop = rect.top - cardRect.height - 14;
            }
            cardTop = clamp(cardTop, 8, vh - cardRect.height - 8);

            let cardLeft = rect.left;
            if (cardLeft + cardRect.width > vw - 8) {
                cardLeft = vw - cardRect.width - 8;
            }
            cardLeft = clamp(cardLeft, 8, vw - cardRect.width - 8);

            coachTourCard.style.left = `${cardLeft}px`;
            coachTourCard.style.top = `${cardTop}px`;
        };

        const closeCoach = (markDone = false) => {
            overlayOpen = false;
            coachTourOverlay.style.display = 'none';
            window.removeEventListener('resize', renderCoachStep);
            window.removeEventListener('scroll', renderCoachStep, true);
            if (markDone) {
                try {
                    localStorage.setItem(doneKey, '1');
                } catch (_err) {
                    // Ignore storage failures.
                }
                playCoachFinishAnimation();
            }
        };

        const hasDone = () => {
            try {
                return localStorage.getItem(doneKey) === '1';
            } catch (_err) {
                return false;
            }
        };

        const startCoach = (force = false, preferredStepIndex = 0) => {
            if (!force && hasDone()) return;

            const featuresPanel = document.getElementById('featuresPanel');
            const btnToggleFeatures = document.getElementById('btnToggleFeatures');
            if (featuresPanel && btnToggleFeatures && featuresPanel.classList.contains('panel-hidden')) {
                btnToggleFeatures.click();
            }

            activeSteps = tourSteps.filter((step) => getTargetRect(step.selector));
            if (activeSteps.length === 0) return;

            activeIndex = clamp(preferredStepIndex, 0, activeSteps.length - 1);
            overlayOpen = true;
            coachTourOverlay.style.display = 'block';
            window.addEventListener('resize', renderCoachStep);
            window.addEventListener('scroll', renderCoachStep, true);
            renderCoachStep();
            requestAnimationFrame(renderCoachStep);
        };

        btnCoachPrev.addEventListener('click', () => {
            if (activeIndex <= 0) return;
            activeIndex -= 1;
            renderCoachStep();
        });

        btnCoachNext.addEventListener('click', () => {
            if (activeIndex >= activeSteps.length - 1) return;
            activeIndex += 1;
            renderCoachStep();
        });

        btnCoachSkip.addEventListener('click', () => closeCoach(false));
        btnCoachFinish.addEventListener('click', () => closeCoach(true));

        if (btnMainTutorial) {
            btnMainTutorial.addEventListener('click', () => startCoach(true));
        }

        window.__startInAppCoachTour = startCoach;
        window.__hasCompletedInAppCoachTour = hasDone;
    }

    function setupLandingFrontPage() {
        if (!landingFront) return;

        const hideLandingImmediately = () => {
            landingFront.style.display = 'none';
            document.body.classList.remove('frontpage-active');
            resizeCanvases();
            render();
        };

        const shouldSkip = false;

        const dismissLanding = (afterDismiss) => {
            landingFront.classList.add('is-leaving');
            document.body.classList.remove('frontpage-active');
            window.setTimeout(() => {
                landingFront.style.display = 'none';
                resizeCanvases();
                render();
                if (typeof afterDismiss === 'function') afterDismiss();
            }, 360);
        };

        if (shouldSkip) {
            hideLandingImmediately();
            return;
        }

        if (btnEnterLab) {
            btnEnterLab.addEventListener('click', () => {
                dismissLanding(() => {
                    if (typeof window.__startInAppCoachTour === 'function') {
                        window.__startInAppCoachTour(true);
                    }
                });
            });
        }

    }

    function resizeCanvases() {
        const wrapper = document.getElementById('canvasWrapper');
        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;

        const gc = graphCanvasEl.parentElement;
        graphCanvasEl.width = gc.clientWidth;
        graphCanvasEl.height = gc.clientHeight;
    }

    function openSolutionOverlay(overlayEl = document.getElementById('solutionOverlay')) {
        if (!overlayEl) return;

        const existingTimer = Number(overlayEl.dataset.closeTimer || 0);
        if (existingTimer) {
            clearTimeout(existingTimer);
            delete overlayEl.dataset.closeTimer;
        }

        overlayEl.classList.remove('solution-overlay--closing');
        overlayEl.style.display = 'flex';
    }

    function closeSolutionOverlayWithAnimation(overlayEl = document.getElementById('solutionOverlay')) {
        if (!overlayEl || overlayEl.style.display === 'none') return;

        const existingTimer = Number(overlayEl.dataset.closeTimer || 0);
        if (existingTimer) {
            clearTimeout(existingTimer);
            delete overlayEl.dataset.closeTimer;
        }

        overlayEl.classList.add('solution-overlay--closing');
        const closeTimer = window.setTimeout(() => {
            overlayEl.style.display = 'none';
            overlayEl.classList.remove('solution-overlay--closing');
            delete overlayEl.dataset.closeTimer;
        }, SOLUTION_CLOSE_ANIM_MS);

        overlayEl.dataset.closeTimer = String(closeTimer);
    }

    function addDefaultCharges() {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        charges.push({
            id: nextChargeId++,
            x: cx - 150,
            y: cy,
            charge: 5e-6,     // +5μC
            sign: 1,
        });
        charges.push({
            id: nextChargeId++,
            x: cx + 150,
            y: cy,
            charge: 3.2e-6,   // -3.2μC
            sign: -1,
        });
        updateFocusPair();
    }

    // ═══════════════════ EVENT LISTENERS ═══════════════════

    function setupEventListeners() {
        window.addEventListener('resize', () => {
            resizeCanvases();
            render();
        });

        // Canvas interactions
        canvas.addEventListener('mousedown', onCanvasMouseDown);
        canvas.addEventListener('mousemove', onCanvasMouseMove);
        canvas.addEventListener('mouseup', onCanvasMouseUp);
        canvas.addEventListener('mouseleave', onCanvasMouseUp);

        // Touch support
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);

        // Buttons
        document.getElementById('btnAddPositive').addEventListener('click', () => addCharge(1));
        document.getElementById('btnAddNegative').addEventListener('click', () => addCharge(-1));
        document.getElementById('btnReset').addEventListener('click', resetAll);
        document.getElementById('btnClearLog').addEventListener('click', clearLog);
        const btnExportData = document.getElementById('btnExportData');
        if (btnExportData) btnExportData.addEventListener('click', exportCSV);
        document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);
        document.getElementById('btnSaveReading').addEventListener('click', saveReading);
        document.getElementById('btnAtomic').addEventListener('click', toggleAtomicMode);

        // Features Panel toggle
        const featuresPanel = document.getElementById('featuresPanel');
        const btnToggleFeatures = document.getElementById('btnToggleFeatures');
        const btnCloseFeatures = document.getElementById('btnCloseFeatures');

        function toggleFeaturesPanel() {
            const isHidden = featuresPanel.classList.toggle('panel-hidden');
            document.body.classList.toggle('features-visible', !isHidden);
            btnToggleFeatures.classList.toggle('active', !isHidden);
            setTimeout(() => { resizeCanvases(); render(); }, 320);
        }

        btnToggleFeatures.addEventListener('click', toggleFeaturesPanel);
        btnCloseFeatures.addEventListener('click', toggleFeaturesPanel);

        // Solution overlay close
        const solutionOverlay = document.getElementById('solutionOverlay');
        document.getElementById('btnCloseSolution').addEventListener('click', () => {
            closeSolutionOverlayWithAnimation();
        });
        document.getElementById('btnCloseSolutionBottom').addEventListener('click', () => {
            closeSolutionOverlayWithAnimation();
        });
        if (btnExportSolutionPdf) {
            btnExportSolutionPdf.addEventListener('click', exportCurrentSolutionAsPdf);
        }
        if (btnCloseExportPicker) {
            btnCloseExportPicker.addEventListener('click', closeExportPicker);
        }
        if (btnCancelExportPicker) {
            btnCancelExportPicker.addEventListener('click', closeExportPicker);
        }
        if (btnConfirmExportReadings) {
            btnConfirmExportReadings.addEventListener('click', confirmExportSelectedReadings);
        }
        solutionOverlay.addEventListener('click', (e) => {
            if (e.target === solutionOverlay) solutionOverlay.style.display = 'none';
        });
        if (exportPickerOverlay) {
            exportPickerOverlay.addEventListener('click', (e) => {
                if (e.target === exportPickerOverlay) closeExportPicker();
            });
        }

        // Slider + Input synced magnitude
        chargeSlider.addEventListener('input', () => {
            const val = parseFloat(chargeSlider.value);
            selectedMagnitude = val;
            chargeInput.value = val;
        });
        chargeInput.addEventListener('change', () => {
            let val = parseFloat(chargeInput.value);
            if (isNaN(val) || val === 0) val = 5;
            val = Math.abs(val);
            chargeInput.value = val;
            selectedMagnitude = val;
            chargeSlider.value = Math.min(val, parseFloat(chargeSlider.max));
        });
        chargeInput.addEventListener('input', () => {
            const val = parseFloat(chargeInput.value);
            if (!isNaN(val) && val !== 0) {
                selectedMagnitude = Math.abs(val);
                chargeSlider.value = Math.min(Math.abs(val), parseFloat(chargeSlider.max));
            }
        });

        // View Toggles
        document.querySelector('#toggleForceArrows input').addEventListener('change', (e) => {
            showForceArrows = e.target.checked;
            render();
        });
        document.querySelector('#toggleSciNotation input').addEventListener('change', (e) => {
            showSciNotation = e.target.checked;
            render();
        });
        document.querySelector('#togglePhysicsPanel input').addEventListener('change', (e) => {
            const show = e.target.checked;
            physicsPanel.classList.toggle('panel-hidden', !show);
            document.body.classList.toggle('sidebar-hidden', !show);
            setTimeout(() => { resizeCanvases(); render(); }, 50);
        });
        document.querySelector('#toggleDataTable input').addEventListener('change', (e) => {
            const show = e.target.checked;
            bottomPanels.classList.toggle('panel-hidden', !show);
            document.body.classList.toggle('bottom-hidden', !show);
            setTimeout(() => { resizeCanvases(); render(); }, 50);
        });

        if (btnAskAI) {
            btnAskAI.addEventListener('click', askPhysicsAI);
        }

        if (aiPresetSelect) {
            aiPresetSelect.addEventListener('change', () => {
                updateAIPresetInputs();
                setAIStatus('pick action');
            });
        }

        if (aiPromptInput) {
            aiPromptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    askPhysicsAI();
                }
            });
        }

        if (aiSimulationSelect) {
            aiSimulationSelect.addEventListener('change', () => {
                if (aiPresetSelect?.value === 'summary-number') {
                    setAIStatus('simulation selected');
                }
            });
        }

        if (btnClearAIImage) {
            btnClearAIImage.addEventListener('click', clearAIImageAttachment);
        }

        if (aiFloatingLauncher && aiChatWidget) {
            aiFloatingLauncher.addEventListener('click', () => setAIChatOpen(true));
        }

        if (btnCloseAIChat && aiChatWidget) {
            btnCloseAIChat.addEventListener('click', () => setAIChatOpen(false));
        }

        if (btnUnlockPair) {
            btnUnlockPair.addEventListener('click', clearLockedPairSelection);
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && aiChatWidget && !aiChatWidget.classList.contains('ai-chat-widget--hidden')) {
                setAIChatOpen(false);
            }
        });
    }

    // ─── Mouse Handlers ───

    function onCanvasMouseDown(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = findChargeAt(mx, my);
        pointerDownChargeId = hit ? hit.id : null;
        pointerDragMoved = false;
        pointerDownX = mx;
        pointerDownY = my;
        if (hit) {
            draggingCharge = hit;
            dragOffsetX = mx - hit.x;
            dragOffsetY = my - hit.y;
            canvas.style.cursor = 'grabbing';
        }
    }

    function onCanvasMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        canvasOffsetEl.textContent = `Offset: ${Math.round(mx)}, ${Math.round(my)}`;

        if (draggingCharge) {
            const movedDist = Math.hypot(mx - pointerDownX, my - pointerDownY);
            if (movedDist > 4) pointerDragMoved = true;
            draggingCharge.x = clamp(mx - dragOffsetX, CHARGE_RADIUS, canvas.width - CHARGE_RADIUS);
            draggingCharge.y = clamp(my - dragOffsetY, CHARGE_RADIUS, canvas.height - CHARGE_RADIUS);
            updateFocusPair();
            render();
        } else {
            const hover = findChargeAt(mx, my);
            canvas.style.cursor = hover ? 'grab' : 'default';
        }
    }

    function onCanvasMouseUp() {
        if (draggingCharge && !pointerDragMoved && pointerDownChargeId) {
            selectChargeForPairLock(pointerDownChargeId);
        }

        if (draggingCharge) {
            draggingCharge = null;
            canvas.style.cursor = 'default';
        }

        pointerDownChargeId = null;
        pointerDragMoved = false;
    }

    // ─── Touch Handlers ───

    function onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = touch.clientX - rect.left;
        const my = touch.clientY - rect.top;
        const hit = findChargeAt(mx, my);
        if (hit) {
            draggingCharge = hit;
            dragOffsetX = mx - hit.x;
            dragOffsetY = my - hit.y;
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (!draggingCharge) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = touch.clientX - rect.left;
        const my = touch.clientY - rect.top;
        draggingCharge.x = clamp(mx - dragOffsetX, CHARGE_RADIUS, canvas.width - CHARGE_RADIUS);
        draggingCharge.y = clamp(my - dragOffsetY, CHARGE_RADIUS, canvas.height - CHARGE_RADIUS);
        render();
    }

    function onTouchEnd() {
        if (draggingCharge) {
            draggingCharge = null;
        }
    }

    // ═══════════════════ CHARGE MANAGEMENT ═══════════════════

    function addCharge(sign) {
        addChargeWithOptions({ sign });
    }

    function addChargeWithOptions(options = {}) {
        const requestedSign = Number(options.sign);
        const customMicro = Number(options.valueMicroC);
        const sign = Number.isFinite(customMicro) && customMicro < 0
            ? -1
            : (requestedSign === -1 ? -1 : 1);
        const x = 100 + Math.random() * (canvas.width - 200);
        const y = 100 + Math.random() * (canvas.height - 200);
        let chargeVal;
        if (Number.isFinite(customMicro)) {
            chargeVal = Math.max(Math.abs(customMicro), 1e-15) * 1e-6;
        } else if (isAtomicMode) {
            chargeVal = 1.602e-19; // Elementary charge
        } else {
            chargeVal = Math.max(Math.abs(selectedMagnitude), 1e-15) * 1e-6;
        }

        charges.push({
            id: nextChargeId++,
            x, y,
            charge: chargeVal,
            sign,
        });
        updateFocusPair();
        render();
    }

    function deleteCharge(id) {
        charges = charges.filter(c => c.id !== id);
        updateFocusPair();
        render();
    }

    function resetAll() {
        charges = [];
        focusPair = [null, null];
        dataLog = [];
        graphPoints = [];
        quizState = null;
        nextChargeId = 1;
        clearLog();
        addDefaultCharges();
        updateAIPresetInputs();
        render();
    }

    function toggleAtomicMode() {
        isAtomicMode = !isAtomicMode;
        const btn = document.getElementById('btnAtomic');
        btn.classList.toggle('active', isAtomicMode);

        if (isAtomicMode) {
            // Set slider/input to show atomic value
            chargeSlider.disabled = true;
            chargeInput.disabled = true;
            chargeInput.value = '1.602×10⁻¹³';
        } else {
            chargeSlider.disabled = false;
            chargeInput.disabled = false;
            chargeInput.value = selectedMagnitude;
        }
    }

    // Find the closest pair of charges to show in sidebar telemetry
    function updateFocusPair() {
        if (charges.length < 2) {
            focusPair = [charges[0] || null, null];
            return;
        }

        if (lockedPairIds.length === 2) {
            const lockedA = charges.find((c) => c.id === lockedPairIds[0]);
            const lockedB = charges.find((c) => c.id === lockedPairIds[1]);
            if (lockedA && lockedB) {
                focusPair = [lockedA, lockedB];
                return;
            }
            // Auto-clear lock if one of the selected charges was removed.
            lockedPairIds = [];
            pairSelectionBuffer = [];
        }

        // If dragging, pair the dragged charge with its nearest neighbor
        if (draggingCharge) {
            let nearest = null;
            let minDist = Infinity;
            for (const c of charges) {
                if (c === draggingCharge) continue;
                const d = Math.hypot(c.x - draggingCharge.x, c.y - draggingCharge.y);
                if (d < minDist) { minDist = d; nearest = c; }
            }
            focusPair = [draggingCharge, nearest];
            return;
        }
        // Otherwise pick the closest pair overall
        let best = [charges[0], charges[1]];
        let bestDist = Infinity;
        for (let i = 0; i < charges.length; i++) {
            for (let j = i + 1; j < charges.length; j++) {
                const d = Math.hypot(charges[i].x - charges[j].x, charges[i].y - charges[j].y);
                if (d < bestDist) { bestDist = d; best = [charges[i], charges[j]]; }
            }
        }
        focusPair = best;
    }

    function selectChargeForPairLock(chargeId) {
        if (!Number.isFinite(Number(chargeId))) return;

        if (pairSelectionBuffer.length === 0 || pairSelectionBuffer[0] !== chargeId) {
            pairSelectionBuffer.push(chargeId);
        }

        if (pairSelectionBuffer.length > 2) {
            pairSelectionBuffer = pairSelectionBuffer.slice(-2);
        }

        if (pairSelectionBuffer.length === 1) {
            showAIActionToast(`Pair pick: q${charges.findIndex((c) => c.id === chargeId) + 1}. Select one more charge.`);
            return;
        }

        lockedPairIds = [...pairSelectionBuffer];
        pairSelectionBuffer = [];
        updateFocusPair();
        render();

        const a = charges.findIndex((c) => c.id === lockedPairIds[0]) + 1;
        const b = charges.findIndex((c) => c.id === lockedPairIds[1]) + 1;
        showAIActionToast(`Pair locked: q${a} and q${b}`);
    }

    function clearLockedPairSelection() {
        lockedPairIds = [];
        pairSelectionBuffer = [];
        updateFocusPair();
        render();
        showAIActionToast('Pair lock cleared. Using closest pair again.');
    }

    // Compute net force vector on a single charge from all others (superposition)
    function computeNetForce(target) {
        let fx = 0, fy = 0;
        for (const other of charges) {
            if (other === target) continue;
            const dx = other.x - target.x;
            const dy = other.y - target.y;
            const distPx = Math.hypot(dx, dy);
            if (distPx < 1) continue;
            const rM = pixelsToMeters(distPx);
            const fMag = K * Math.abs(target.charge) * Math.abs(other.charge) / (rM * rM);
            const ux = dx / distPx;
            const uy = dy / distPx;
            // Attract if opposite signs, repel if same
            const attract = target.sign !== other.sign;
            if (attract) {
                fx += fMag * ux;
                fy += fMag * uy;
            } else {
                fx -= fMag * ux;
                fy -= fMag * uy;
            }
        }
        return { fx, fy, mag: Math.hypot(fx, fy) };
    }

    function findChargeAt(x, y) {
        // Reverse so topmost (latest) charge gets picked first
        for (let i = charges.length - 1; i >= 0; i--) {
            const c = charges[i];
            const dx = x - c.x;
            const dy = y - c.y;
            if (dx * dx + dy * dy <= (CHARGE_RADIUS + 8) * (CHARGE_RADIUS + 8)) return c;
        }
        return null;
    }

    // ═══════════════════ PHYSICS ═══════════════════

    function pixelsToMeters(px) { return px / PIXELS_PER_METER; }
    function metersToPixels(m) { return m * PIXELS_PER_METER; }

    function coulombForce(q1, q2, r) {
        if (r <= 0) return 0;
        return K * Math.abs(q1) * Math.abs(q2) / (r * r);
    }

    function potentialEnergy(q1, q2, r) {
        if (r <= 0) return 0;
        return K * q1 * q2 / r;
    }

    // ═══════════════════ RENDER ═══════════════════

    function render() {
        drawCanvas();
        updateChargeCards();
        updateTelemetry();
        updateEmptyState();
        drawGraph();
    }

    function drawCanvas() {
        const w = canvas.width;
        const h = canvas.height;
        const isDark = document.documentElement.dataset.theme !== 'light';

        // Clear
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = isDark ? '#0F1219' : '#ffffff';
        ctx.fillRect(0, 0, w, h);

        // Dot grid
        ctx.fillStyle = isDark ? '#1e2028' : '#d1d5db';
        for (let x = DOT_GRID_SPACING; x < w; x += DOT_GRID_SPACING) {
            for (let y = DOT_GRID_SPACING; y < h; y += DOT_GRID_SPACING) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Field lines (if enabled and 2+ charges)
        if (showFieldLines && charges.length >= 2) {
            drawFieldLines();
        }

        // Distance indicators between ALL charge pairs
        if (charges.length >= 2) {
            drawAllDistanceIndicators();
        }

        // Force arrows on EVERY charge (net force via superposition)
        if (showForceArrows && charges.length >= 2) {
            drawAllForceArrows();
        }

        // Charges
        for (const c of charges) {
            drawCharge(c);
        }
    }

    // ─── Draw Individual Charge ───

    function drawCharge(c) {
        const isDark = document.documentElement.dataset.theme !== 'light';
        const isPos = c.sign > 0;

        // Outer glow
        const grad = ctx.createRadialGradient(c.x, c.y, CHARGE_RADIUS * 0.3, c.x, c.y, CHARGE_RADIUS * 2.5);
        grad.addColorStop(0, isPos ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, CHARGE_RADIUS * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Ring
        ctx.strokeStyle = isPos
            ? (isDark ? '#EF4444' : '#DC2626')
            : (isDark ? '#3B82F6' : '#2563EB');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, CHARGE_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        if (lockedPairIds.includes(c.id)) {
            ctx.strokeStyle = isDark ? 'rgba(250, 204, 21, 0.95)' : 'rgba(161, 98, 7, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(c.x, c.y, CHARGE_RADIUS + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Fill
        ctx.fillStyle = isDark
            ? (isPos ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)')
            : (isPos ? 'rgba(239, 68, 68, 0.06)' : 'rgba(59, 130, 246, 0.06)');
        ctx.fill();

        // Mannequin icon
        const icoColor = isPos
            ? (isDark ? '#FCA5A5' : '#DC2626')
            : (isDark ? '#93C5FD' : '#2563EB');
        ctx.fillStyle = icoColor;
        ctx.strokeStyle = icoColor;
        ctx.lineWidth = 1.5;

        // Head
        ctx.beginPath();
        ctx.arc(c.x, c.y - 8, 5, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - 3);
        ctx.lineTo(c.x, c.y + 6);
        ctx.stroke();

        // Arms
        ctx.beginPath();
        ctx.moveTo(c.x - 7, c.y);
        ctx.lineTo(c.x + 7, c.y);
        ctx.stroke();

        // Legs
        ctx.beginPath();
        ctx.moveTo(c.x, c.y + 6);
        ctx.lineTo(c.x - 5, c.y + 13);
        ctx.moveTo(c.x, c.y + 6);
        ctx.lineTo(c.x + 5, c.y + 13);
        ctx.stroke();

        // Label
        const idx = charges.indexOf(c) + 1;
        ctx.font = '600 10px "Space Grotesk"';
        ctx.textAlign = 'center';
        ctx.fillStyle = icoColor;
        ctx.fillText(`q${idx}`, c.x, c.y + CHARGE_RADIUS + 14);

        const expiry = recentChargeUpdates.get(c.id);
        if (expiry) {
            const now = Date.now();
            if (now >= expiry) {
                recentChargeUpdates.delete(c.id);
            } else {
                const duration = 1400;
                const progress = 1 - Math.max(0, expiry - now) / duration;
                const pulseR = CHARGE_RADIUS + 6 + progress * 24;
                const alpha = Math.max(0, 0.55 - progress * 0.5);

                ctx.beginPath();
                ctx.arc(c.x, c.y, pulseR, 0, Math.PI * 2);
                ctx.strokeStyle = isPos
                    ? `rgba(239, 68, 68, ${alpha.toFixed(3)})`
                    : `rgba(59, 130, 246, ${alpha.toFixed(3)})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }

    // ─── Field Lines ───

    function drawFieldLines() {
        const isDark = document.documentElement.dataset.theme !== 'light';
        ctx.lineWidth = 1;
        ctx.globalAlpha = isDark ? 0.3 : 0.25;

        const positives = charges.filter(c => c.sign > 0);
        const negatives = charges.filter(c => c.sign < 0);
        const sources = positives.length > 0 ? positives : negatives;
        const direction = positives.length > 0 ? 1 : -1;

        for (const src of sources) {
            for (let i = 0; i < FIELD_LINE_COUNT; i++) {
                const angle = (2 * Math.PI * i) / FIELD_LINE_COUNT;
                let px = src.x + Math.cos(angle) * (CHARGE_RADIUS + 4);
                let py = src.y + Math.sin(angle) * (CHARGE_RADIUS + 4);

                ctx.beginPath();
                ctx.moveTo(px, py);

                const isDashed = i % 2 === 0;
                ctx.setLineDash(isDashed ? [6, 4] : []);
                ctx.strokeStyle = isDark ? '#60A5FA' : '#3B82F6';

                for (let step = 0; step < FIELD_LINE_MAX_STEPS; step++) {
                    let Ex = 0, Ey = 0;
                    for (const c of charges) {
                        const dx = px - c.x;
                        const dy = py - c.y;
                        const r2 = dx * dx + dy * dy;
                        if (r2 < 4) break;
                        const r = Math.sqrt(r2);
                        const E = K * c.charge / r2;
                        Ex += E * c.sign * (dx / r);
                        Ey += E * c.sign * (dy / r);
                    }
                    const E = Math.sqrt(Ex * Ex + Ey * Ey);
                    if (E < 0.001) break;
                    px += direction * FIELD_LINE_STEP * (Ex / E);
                    py += direction * FIELD_LINE_STEP * (Ey / E);

                    if (px < -20 || px > canvas.width + 20 || py < -20 || py > canvas.height + 20) break;

                    let hitSink = false;
                    for (const c of charges) {
                        if (c === src) continue;
                        const d2 = (px - c.x) ** 2 + (py - c.y) ** 2;
                        if (d2 < (CHARGE_RADIUS * 0.7) ** 2) { hitSink = true; break; }
                    }

                    ctx.lineTo(px, py);
                    if (hitSink) break;
                }
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    // ─── Force Arrows (Net force on EVERY charge) ───

    function drawAllForceArrows() {
        for (const c of charges) {
            const net = computeNetForce(c);
            if (net.mag < 1e-15) continue;

            // Arrow length scaled logarithmically for visibility
            const arrowLen = clamp(Math.log10(net.mag + 1) * 50 + 25, 25, 180);

            const ux = net.fx / net.mag;
            const uy = net.fy / net.mag;

            const startX = c.x + ux * (CHARGE_RADIUS + 4);
            const startY = c.y + uy * (CHARGE_RADIUS + 4);
            const endX = c.x + ux * (CHARGE_RADIUS + 4 + arrowLen);
            const endY = c.y + uy * (CHARGE_RADIUS + 4 + arrowLen);

            drawArrow(
                startX, startY, endX, endY,
                c.sign > 0 ? '#EF4444' : '#3B82F6',
                2.5
            );

            // Force label near arrowhead
            if (showSciNotation) {
                const labelX = (startX + endX) / 2;
                const labelY = (startY + endY) / 2 - 14;
                drawFloatingLabel(labelX, labelY, `F = ${formatSci(net.mag, 'N')}`);
            }
        }
    }

    function drawArrow(x1, y1, x2, y2, color, width) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 3) return;
        const ux = dx / len;
        const uy = dy / len;
        const headLen = Math.min(12, len * 0.35);

        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';

        // Shaft
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2 - ux * headLen, y2 - uy * headLen);
        ctx.stroke();

        // Arrowhead
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * headLen - uy * headLen * 0.45, y2 - uy * headLen + ux * headLen * 0.45);
        ctx.lineTo(x2 - ux * headLen + uy * headLen * 0.45, y2 - uy * headLen - ux * headLen * 0.45);
        ctx.closePath();
        ctx.fill();
    }

    function drawFloatingLabel(x, y, text) {
        const isDark = document.documentElement.dataset.theme !== 'light';
        ctx.font = '500 10px "Geist Mono"';
        const metrics = ctx.measureText(text);
        const pad = 5;
        const w = metrics.width + pad * 2;
        const h = 18;

        ctx.fillStyle = isDark ? 'rgba(15, 18, 25, 0.85)' : 'rgba(255, 255, 255, 0.9)';
        roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    // ─── Distance Indicators (between ALL pairs) ───

    function drawAllDistanceIndicators() {
        const isDark = document.documentElement.dataset.theme !== 'light';

        for (let i = 0; i < charges.length; i++) {
            for (let j = i + 1; j < charges.length; j++) {
                const c1 = charges[i];
                const c2 = charges[j];
                const dx = c2.x - c1.x;
                const dy = c2.y - c1.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 1) continue;

                const isFocusPair = (focusPair[0] === c1 && focusPair[1] === c2) ||
                                    (focusPair[0] === c2 && focusPair[1] === c1);
                const alpha = isFocusPair ? 0.6 : 0.25;

                // Dashed connecting line
                const ux = dx / dist;
                const uy = dy / dist;
                const offX = -uy * 12;
                const offY = ux * 12;

                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = isDark
                    ? `rgba(71, 85, 105, ${alpha})`
                    : `rgba(100, 116, 139, ${alpha * 0.7})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(c1.x + offX, c1.y + offY);
                ctx.lineTo(c2.x + offX, c2.y + offY);
                ctx.stroke();
                ctx.setLineDash([]);

                // Distance label (only for focus pair or if <= 3 charges total)
                if (showSciNotation && (isFocusPair || charges.length <= 3)) {
                    const midX = (c1.x + c2.x) / 2 + offX;
                    const midY = (c1.y + c2.y) / 2 + offY;
                    const rMeters = pixelsToMeters(dist);
                    drawFloatingLabel(midX, midY, `r = ${rMeters.toFixed(3)} m`);
                }
            }
        }
    }

    // ═══════════════════ SIDEBAR UPDATE ═══════════════════

    function updateChargeCards() {
        let html = '';
        if (charges.length === 0) {
            html = '<div class="charge-card charge-card--empty"><p>Walang charge. Mag-add para magsimula.</p></div>';
        } else {
            // Show ALL charges in the sidebar
            charges.forEach((c, i) => {
                if (!c) return;
                const isPos = c.sign > 0;
                const idx = i + 1;
                const absCharge = Math.abs(c.charge);
                const maxCharge = 10e-6;
                const barWidth = isAtomicMode ? 5 : Math.min((absCharge / maxCharge) * 100, 100);
                const netF = computeNetForce(c);

                html += `
                <div class="charge-card charge-card--${isPos ? 'positive' : 'negative'}">
                    <div class="charge-card-header">
                        <span class="charge-card-label charge-card-label--${isPos ? 'pos' : 'neg'}">Charge ${idx} (q${idx})</span>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <span class="charge-card-dot charge-card-dot--${isPos ? 'pos' : 'neg'}"></span>
                            <button class="btn-delete-charge" onclick="window.__deleteCharge(${c.id})" title="Delete this charge">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    </div>
                    <div class="charge-card-value">
                        <span class="charge-card-value-label">Value</span>
                        <span class="charge-card-value-num">${formatSciHTML(c.charge * c.sign)} C</span>
                    </div>
                    <div class="charge-card-value">
                        <span class="charge-card-value-label">Net F</span>
                        <span class="charge-card-value-num" style="color:var(--tertiary)">${formatSci(netF.mag, 'N')}</span>
                    </div>
                    <div class="charge-bar-track">
                        <div class="charge-bar-fill charge-bar-fill--${isPos ? 'pos' : 'neg'}" style="width:${barWidth}%"></div>
                    </div>
                </div>`;
            });
        }
        chargeCardsContainer.innerHTML = html;
    }

    // Expose delete function globally for inline onclick
    window.__deleteCharge = deleteCharge;

    function updateTelemetry() {
        const c1 = focusPair[0];
        const c2 = focusPair[1];

        if (!c1 || !c2) {
            valSeparation.textContent = '—';
            valForce.textContent = '—';
            valDirection.textContent = '—';
            valPotential.textContent = '—';
            const typeEl = document.getElementById('valInteraction');
            if (typeEl) typeEl.textContent = '—';
            return;
        }

        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const rMeters = pixelsToMeters(dist);
        const force = coulombForce(c1.charge, c2.charge, rMeters);
        const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        const pe = potentialEnergy(c1.charge * c1.sign, c2.charge * c2.sign, rMeters);

        valSeparation.textContent = rMeters.toFixed(3) + ' m';
        valForce.textContent = formatSci(force, 'N');
        valDirection.textContent = ((angle % 360 + 360) % 360).toFixed(2) + '°';
        valPotential.textContent = formatSci(pe, 'J');

        // Interaction type
        const interactionType = c1.sign === c2.sign ? 'Repulsion' : 'Attraction';
        const typeEl = document.getElementById('valInteraction');
        if (typeEl) {
            typeEl.textContent = interactionType;
            typeEl.style.color = c1.sign === c2.sign
                ? 'var(--charge-pos)'
                : 'var(--charge-neg)';
        }
    }

    function updateEmptyState() {
        emptyState.style.display = charges.length === 0 ? 'flex' : 'none';
    }

    function buildPhysicsContext() {
        const c1 = focusPair[0];
        const c2 = focusPair[1];

        const chargeSummary = charges.map((c, idx) => ({
            id: c.id,
            label: `q${idx + 1}`,
            sign: c.sign > 0 ? 'positive' : 'negative',
            valueCoulombs: c.sign * c.charge,
            xPx: Number(c.x.toFixed(1)),
            yPx: Number(c.y.toFixed(1)),
        }));

        if (!c1 || !c2) {
            return {
                chargeCount: charges.length,
                charges: chargeSummary,
                focusPair: null,
            };
        }

        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.hypot(dx, dy);
        const rMeters = pixelsToMeters(dist);
        const forceN = coulombForce(c1.charge, c2.charge, rMeters);
        const potentialJ = potentialEnergy(c1.charge * c1.sign, c2.charge * c2.sign, rMeters);

        return {
            chargeCount: charges.length,
            charges: chargeSummary,
            focusPair: {
                interaction: c1.sign === c2.sign ? 'repulsion' : 'attraction',
                distanceMeters: Number(rMeters.toFixed(6)),
                forceNewtons: forceN,
                potentialJoules: potentialJ,
            },
        };
    }

    function setAIStatus(text) {
        if (aiStatus) aiStatus.textContent = `Status: ${text}`;
    }

    function refreshAISimulationOptions() {
        if (!aiSimulationSelect) return;

        const previousValue = aiSimulationSelect.value;
        const options = ['<option value="">Select simulation</option>'];

        for (let i = dataLog.length - 1; i >= 0; i--) {
            const row = dataLog[i];
            const interaction = row.type === 'attract' ? 'Attract' : 'Repel';
            options.push(`<option value="${row.num}">#${row.num} (${row.pair}, ${interaction})</option>`);
        }

        aiSimulationSelect.innerHTML = options.join('');

        if (previousValue && dataLog.some((row) => String(row.num) === previousValue)) {
            aiSimulationSelect.value = previousValue;
        }
    }

    function syncQuizActionSequence() {
        if (!aiPresetSelect) return;
        const quizCheckOption = aiPresetSelect.querySelector('option[value="quiz-check"]');
        if (!quizCheckOption) return;

        const canCheckQuiz = Boolean(quizState);
        quizCheckOption.disabled = !canCheckQuiz;

        if (!canCheckQuiz && aiPresetSelect.value === 'quiz-check') {
            aiPresetSelect.value = 'quiz-generate';
        }
    }

    function updateAIPresetInputs() {
        if (!aiPresetSelect || !aiSimulationSelect) return;
        syncQuizActionSequence();
        const needsSimulationNumber = aiPresetSelect.value === 'summary-number';
        const needsQuizInput = aiPresetSelect.value === 'quiz-check';
        aiSimulationSelect.disabled = !needsSimulationNumber;

        if (aiPromptInput) {
            aiPromptInput.classList.toggle('ai-chat-input--hidden', !needsQuizInput);
            aiPromptInput.disabled = !needsQuizInput;
            aiPromptInput.placeholder = needsQuizInput
                ? 'Type your quiz answer in Newtons (e.g., 0.42)'
                : 'Type your quiz answer in Newtons';
            if (!needsQuizInput) aiPromptInput.value = '';
        }
    }

    function buildQuizFromFocusPair() {
        const c1 = focusPair[0];
        const c2 = focusPair[1];
        if (!c1 || !c2) return null;

        const q1 = c1.sign * c1.charge;
        const q2 = c2.sign * c2.charge;
        const rMeters = pixelsToMeters(Math.hypot(c2.x - c1.x, c2.y - c1.y));
        const expectedForceN = coulombForce(c1.charge, c2.charge, rMeters);

        return {
            expectedForceN,
            questionText: [
                'Quiz generated from focused pair:',
                `Given: $q_1=${formatSciLatex(q1)}\\,\\mathrm{C}$, $q_2=${formatSciLatex(q2)}\\,\\mathrm{C}$, $r=${rMeters.toFixed(4)}\\,\\mathrm{m}$`,
                'Find the magnitude of force $F$ in Newtons.',
                'Enter your answer using action: Check quiz answer.',
            ].join('\n'),
        };
    }

    function parseQuizAnswerValue(rawText) {
        const text = String(rawText || '').trim();
        if (!text) return NaN;

        const direct = Number(text);
        if (Number.isFinite(direct)) return direct;

        const firstNumber = text.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
        if (!firstNumber) return NaN;
        return Number(firstNumber[0]);
    }

    function checkQuizAnswer(answerText) {
        if (!quizState) {
            return 'No active quiz yet. First choose: Generate quiz from focused pair.';
        }

        const answer = parseQuizAnswerValue(answerText);
        if (!Number.isFinite(answer) || answer <= 0) {
            return 'Enter a valid positive numeric answer in the chat input, then run Check quiz answer.';
        }

        const expected = quizState.expectedForceN;
        const errorPct = Math.abs(answer - expected) / expected * 100;
        const withinTolerance = errorPct <= 5;

        return [
            withinTolerance ? 'Correct within 5% tolerance.' : 'Not yet correct.',
            `Your answer: $${formatSciLatex(answer)}\\,\\mathrm{N}$`,
            `Expected: $${formatSciLatex(expected)}\\,\\mathrm{N}$`,
            `Percent error: $${errorPct.toFixed(2)}\\%$`,
            withinTolerance
                ? 'Great job. You can generate a new quiz for more practice.'
                : 'Tip: Recompute using $F = k\\frac{|q_1q_2|}{r^2}$ and watch unit conversion.',
        ].join('\n');
    }

    function buildPdfReportText() {
        if (charges.length < 2) {
            return 'No solution data available. Add at least two charges and save or compute a reading first.';
        }

        const sections = [];
        let pairNum = 0;

        for (let i = 0; i < charges.length; i++) {
            for (let j = i + 1; j < charges.length; j++) {
                const c1 = charges[i];
                const c2 = charges[j];
                const q1 = c1.sign * c1.charge;
                const q2 = c2.sign * c2.charge;
                const dx = c2.x - c1.x;
                const dy = c2.y - c1.y;
                const r = pixelsToMeters(Math.hypot(dx, dy));
                const f = coulombForce(c1.charge, c2.charge, r);
                const u = potentialEnergy(q1, q2, r);
                const interaction = c1.sign === c2.sign ? 'Repulsion' : 'Attraction';
                pairNum += 1;

                sections.push(`Pair ${pairNum}: q${i + 1} <-> q${j + 1}`);
                sections.push('1) Given / Identify');
                sections.push(`k = 8.9875 x 10^9 N.m^2/C^2`);
                sections.push(`q1 = ${formatSciPdf(q1, 'C')}`);
                sections.push(`q2 = ${formatSciPdf(q2, 'C')}`);
                sections.push(`r = ${r.toFixed(4)} m`);
                sections.push('2) Formula (LaTeX style)');
                sections.push('F = k \\cdot \\frac{|q_1 q_2|}{r^2}');
                sections.push('U = k \\cdot \\frac{q_1 q_2}{r}');
                sections.push('3) Substitution (LaTeX style)');
                sections.push(`F = (8.9875 \\times 10^9) \\cdot \\frac{|(${formatSciPdf(q1)})(${formatSciPdf(q2)})|}{(${r.toFixed(4)})^2}`);
                sections.push(`U = (8.9875 \\times 10^9) \\cdot \\frac{(${formatSciPdf(q1)})(${formatSciPdf(q2)})}{${r.toFixed(4)}}`);
                sections.push('4) Results');
                sections.push(`F = ${formatSciPdf(f, 'N')}`);
                sections.push(`U = ${formatSciPdf(u, 'J')}`);
                sections.push(`Interaction = ${interaction}`);
                sections.push('');
            }
        }

        return sections.join('\n');
    }

    function getReadingEntries(readingId) {
        return dataLog
            .filter((row) => row.readingId === readingId)
            .sort((a, b) => Number(a.num) - Number(b.num));
    }

    function getReadingLabel(readingId, readingIndex) {
        const tsNum = Number(String(readingId).split('_')[0]);
        const timeLabel = Number.isFinite(tsNum) ? new Date(tsNum).toLocaleString() : 'Unknown time';
        const entries = getReadingEntries(readingId);
        const simRange = entries.length > 0
            ? `Sim ${entries[0].num}${entries.length > 1 ? `-${entries[entries.length - 1].num}` : ''}`
            : 'No logged simulations';
        return {
            title: `Reading ${readingIndex + 1}`,
            meta: `${simRange} • ${entries.length} pair(s) • ${timeLabel}`,
        };
    }

    function populateExportReadingList() {
        if (!exportReadingList) return;

        if (savedReadings.length === 0) {
            exportReadingList.innerHTML = '<p class="export-picker-note">No saved readings yet. Click Save This Reading first.</p>';
            return;
        }

        const html = savedReadings
            .map((reading, idx) => {
                const label = getReadingLabel(reading.id, idx);
                const checked = activeReadingId
                    ? reading.id === activeReadingId
                    : idx === savedReadings.length - 1;
                return `
                    <label class="export-reading-item">
                        <input type="checkbox" class="export-reading-check" value="${reading.id}" ${checked ? 'checked' : ''}/>
                        <span class="export-reading-item-label">
                            <span class="export-reading-item-title">${label.title}</span>
                            <span class="export-reading-item-meta">${label.meta}</span>
                        </span>
                    </label>
                `;
            })
            .join('');

        exportReadingList.innerHTML = html;
    }

    function setExportButtonsLoading(isLoading) {
        if (btnExportSolutionPdf) {
            btnExportSolutionPdf.innerHTML = isLoading
                ? '<span class="material-symbols-outlined">hourglass_top</span>Exporting...'
                : '<span class="material-symbols-outlined">picture_as_pdf</span>Export PDF';
        }

        if (btnConfirmExportReadings) {
            btnConfirmExportReadings.innerHTML = isLoading
                ? '<span class="material-symbols-outlined">hourglass_top</span>Exporting...'
                : '<span class="material-symbols-outlined">picture_as_pdf</span>Export Selected';
        }
    }

    function showExportProgressOverlay() {
        if (!exportProgressOverlay) return;
        exportProgressOverlay.style.display = 'flex';
    }

    function hideExportProgressOverlay() {
        if (!exportProgressOverlay) return;
        exportProgressOverlay.style.display = 'none';
    }

    function showExportDonePopup(message) {
        if (!exportDonePopup || !exportDoneText) return;

        if (exportDonePopupTimer) {
            clearTimeout(exportDonePopupTimer);
            exportDonePopupTimer = null;
        }

        exportDoneText.textContent = message || 'Done Exporting';
        exportDonePopup.style.display = 'flex';
        requestAnimationFrame(() => {
            exportDonePopup.classList.add('export-done-popup--show');
        });

        exportDonePopupTimer = window.setTimeout(() => {
            exportDonePopup.classList.remove('export-done-popup--show');
            window.setTimeout(() => {
                exportDonePopup.style.display = 'none';
            }, 220);
        }, 1700);
    }

    function openExportPicker() {
        if (!exportPickerOverlay) return;
        populateExportReadingList();
        if (exportPickerError) {
            exportPickerError.textContent = '';
            exportPickerError.style.display = 'none';
        }
        openSolutionOverlay(exportPickerOverlay);
    }

    function closeExportPicker() {
        if (!exportPickerOverlay) return;
        if (exportPickerError) {
            exportPickerError.textContent = '';
            exportPickerError.style.display = 'none';
        }
        closeSolutionOverlayWithAnimation(exportPickerOverlay);
    }

    async function exportReadingsAsPdf(readingIds) {
        if (isExportingPdf) {
            showAIActionToast('PDF export already running...');
            return;
        }

        const jsPdfApi = window.jspdf && window.jspdf.jsPDF;
        const html2canvasApi = window.html2canvas;
        if (!jsPdfApi || typeof html2canvasApi !== 'function') {
            showAIActionToast('PDF dependencies are not loaded.');
            return;
        }

        const selectedReadings = savedReadings.filter((r) => readingIds.includes(r.id));
        if (selectedReadings.length === 0) {
            showAIActionToast('No readings selected for export.');
            return;
        }

        const pageHost = document.createElement('div');
        pageHost.style.position = 'fixed';
        pageHost.style.left = '0';
        pageHost.style.top = '0';
        pageHost.style.width = '1px';
        pageHost.style.height = '1px';
        pageHost.style.overflow = 'hidden';
        pageHost.style.zIndex = '2147483646';
        pageHost.style.pointerEvents = 'none';
        document.body.appendChild(pageHost);

        const PAGE_W = 780;
        const PAGE_H = 1040;
        const PAD_X = 30;
        const PAD_Y = 28;

        const makePage = () => {
            const el = document.createElement('div');
            el.style.width = `${PAGE_W}px`;
            el.style.height = `${PAGE_H}px`;
            el.style.boxSizing = 'border-box';
            el.style.padding = `${PAD_Y}px ${PAD_X}px`;
            el.style.background = '#ffffff';
            el.style.color = '#111111';
            el.style.fontFamily = 'Georgia, "Times New Roman", serif';
            el.style.fontSize = '12px';
            el.style.lineHeight = '1.45';
            return el;
        };

        const makeBlock = (html) => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            return wrapper.firstElementChild;
        };

        const pages = [];
        let currentPage = makePage();
        pageHost.appendChild(currentPage);
        pages.push(currentPage);

        const ensureFitsOrNewPage = (blockEl) => {
            renderMathMarkup(blockEl);
            currentPage.appendChild(blockEl);
            const fits = currentPage.scrollHeight <= PAGE_H;
            if (fits) return;

            currentPage.removeChild(blockEl);
            currentPage = makePage();
            pageHost.appendChild(currentPage);
            pages.push(currentPage);
            currentPage.appendChild(blockEl);
        };

        const buildSimulationSnapshotDataUrl = (reading, entries) => {
            if (reading && typeof reading.simulationImageDataUrl === 'string' && reading.simulationImageDataUrl.startsWith('data:image/')) {
                return reading.simulationImageDataUrl;
            }

            const savedCanvasWidth = Number(reading?.canvasSnapshot?.width) || canvas.width || 1;
            const savedCanvasHeight = Number(reading?.canvasSnapshot?.height) || canvas.height || 1;
            const safeW = Math.max(1, savedCanvasWidth);
            const safeH = Math.max(1, savedCanvasHeight);

            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = 740;
            // Keep export framing close to the real simulation aspect ratio.
            snapCanvas.height = clamp(Math.round((snapCanvas.width * safeH) / safeW), 220, 380);
            const snapCtx = snapCanvas.getContext('2d');
            if (!snapCtx) return null;

            snapCtx.fillStyle = '#070d1f';
            snapCtx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);

            snapCtx.fillStyle = 'rgba(148, 163, 184, 0.22)';
            for (let x = 12; x < snapCanvas.width; x += 24) {
                for (let y = 12; y < snapCanvas.height; y += 24) {
                    snapCtx.fillRect(x, y, 1.3, 1.3);
                }
            }

            const snapshotCharges = Array.isArray(reading?.chargesSnapshot) ? reading.chargesSnapshot : [];
            if (snapshotCharges.length === 0) {
                return snapCanvas.toDataURL('image/jpeg', 0.88);
            }

            // Map from full saved canvas bounds so export includes the entire simulation area.
            const minX = 0;
            const maxX = safeW;
            const minY = 0;
            const maxY = safeH;
            const srcW = Math.max(1, maxX - minX);
            const srcH = Math.max(1, maxY - minY);
            const padX = 24;
            const padY = 22;
            const dstW = snapCanvas.width - padX * 2;
            const dstH = snapCanvas.height - padY * 2;
            const scale = Math.min(dstW / srcW, dstH / srcH);

            const mapX = (x) => padX + (x - minX) * scale + (dstW - srcW * scale) / 2;
            const mapY = (y) => padY + (y - minY) * scale + (dstH - srcH * scale) / 2;

            if (snapshotCharges.length >= 2) {
                const c1 = snapshotCharges[0];
                const c2 = snapshotCharges[1];
                const x1 = mapX(c1.x);
                const y1 = mapY(c1.y);
                const x2 = mapX(c2.x);
                const y2 = mapY(c2.y);

                snapCtx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
                snapCtx.setLineDash([4, 6]);
                snapCtx.lineWidth = 1.5;
                snapCtx.beginPath();
                snapCtx.moveTo(x1, y1);
                snapCtx.lineTo(x2, y2);
                snapCtx.stroke();
                snapCtx.setLineDash([]);

                const primaryEntry = entries && entries.length > 0 ? entries[0] : null;
                if (primaryEntry) {
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const mag = Math.hypot(dx, dy) || 1;
                    const ux = dx / mag;
                    const uy = dy / mag;
                    const isAttract = primaryEntry.type === 'attract';
                    const d = isAttract ? 1 : -1;
                    const arrowLen = 44;

                    const drawArrow = (sx, sy, ex, ey, color) => {
                        snapCtx.strokeStyle = color;
                        snapCtx.fillStyle = color;
                        snapCtx.lineWidth = 3;
                        snapCtx.beginPath();
                        snapCtx.moveTo(sx, sy);
                        snapCtx.lineTo(ex, ey);
                        snapCtx.stroke();

                        const ang = Math.atan2(ey - sy, ex - sx);
                        const head = 7;
                        snapCtx.beginPath();
                        snapCtx.moveTo(ex, ey);
                        snapCtx.lineTo(ex - head * Math.cos(ang - Math.PI / 7), ey - head * Math.sin(ang - Math.PI / 7));
                        snapCtx.lineTo(ex - head * Math.cos(ang + Math.PI / 7), ey - head * Math.sin(ang + Math.PI / 7));
                        snapCtx.closePath();
                        snapCtx.fill();
                    };

                    drawArrow(x1 + ux * 30, y1 + uy * 30, x1 + ux * (30 + arrowLen * d), y1 + uy * (30 + arrowLen * d), '#ef4444');
                    drawArrow(x2 - ux * 30, y2 - uy * 30, x2 - ux * (30 + arrowLen * d), y2 - uy * (30 + arrowLen * d), '#60a5fa');

                    snapCtx.fillStyle = 'rgba(224, 231, 255, 0.88)';
                    snapCtx.font = '600 14px "Geist Mono", monospace';
                    snapCtx.textAlign = 'center';
                    snapCtx.fillText(`r = ${primaryEntry.r.toFixed(3)} m`, (x1 + x2) / 2, Math.min(y1, y2) - 14);
                    snapCtx.fillText(`F = ${formatSciShort(primaryEntry.f)} N`, (x1 + x2) / 2, Math.min(y1, y2) + 4);
                }
            }

            snapshotCharges.forEach((c, idx) => {
                const x = mapX(c.x);
                const y = mapY(c.y);
                const isPos = c.sign > 0;
                const stroke = isPos ? '#ef4444' : '#3b82f6';
                const fill = isPos ? 'rgba(239, 68, 68, 0.18)' : 'rgba(59, 130, 246, 0.18)';
                const label = isPos ? '+' : '-';

                snapCtx.strokeStyle = stroke;
                snapCtx.fillStyle = fill;
                snapCtx.lineWidth = 3;
                snapCtx.beginPath();
                snapCtx.arc(x, y, 28, 0, Math.PI * 2);
                snapCtx.fill();
                snapCtx.stroke();

                snapCtx.fillStyle = isPos ? '#fca5a5' : '#93c5fd';
                snapCtx.font = '700 26px "Space Grotesk", sans-serif';
                snapCtx.textAlign = 'center';
                snapCtx.fillText(label, x, y + 9);

                snapCtx.fillStyle = isPos ? '#fca5a5' : '#93c5fd';
                snapCtx.font = '600 14px "Geist Mono", monospace';
                snapCtx.fillText(`q${idx + 1}`, x, y + 46);
            });

            return snapCanvas.toDataURL('image/jpeg', 0.88);
        };

        const buildGraphSnapshotDataUrl = (readingEntries, reading) => {
            const gCanvas = document.createElement('canvas');
            gCanvas.width = 740;
            gCanvas.height = 250;
            const g = gCanvas.getContext('2d');
            if (!g) return null;

            g.fillStyle = '#090f22';
            g.fillRect(0, 0, gCanvas.width, gCanvas.height);

            const ml = 54;
            const mr = 20;
            const mt = 20;
            const mb = 34;
            const pw = gCanvas.width - ml - mr;
            const ph = gCanvas.height - mt - mb;

            const points = Array.isArray(readingEntries) ? readingEntries : [];
            const rMin = 0.02;
            let rMax = 0.6;
            let fMax = 0.5;
            if (points.length > 0) {
                rMax = Math.max(0.3, ...points.map((p) => p.r)) * 1.2;
                fMax = Math.max(0.1, ...points.map((p) => p.f)) * 1.25;
            }

            g.strokeStyle = 'rgba(148,163,184,0.15)';
            g.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = mt + (ph * i) / 4;
                g.beginPath();
                g.moveTo(ml, y);
                g.lineTo(ml + pw, y);
                g.stroke();

                const x = ml + (pw * i) / 4;
                g.beginPath();
                g.moveTo(x, mt);
                g.lineTo(x, mt + ph);
                g.stroke();
            }

            g.strokeStyle = 'rgba(226,232,240,0.55)';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(ml, mt);
            g.lineTo(ml, mt + ph);
            g.lineTo(ml + pw, mt + ph);
            g.stroke();

            g.fillStyle = 'rgba(226,232,240,0.8)';
            g.font = '500 11px "Geist Mono", monospace';
            g.textAlign = 'center';
            g.fillText('r (m)', ml + pw / 2, gCanvas.height - 8);
            g.save();
            g.translate(14, mt + ph / 2);
            g.rotate(-Math.PI / 2);
            g.fillText('F (N)', 0, 0);
            g.restore();

            g.fillStyle = 'rgba(148,163,184,0.8)';
            g.font = '400 10px "Geist Mono", monospace';
            g.textAlign = 'right';
            for (let i = 0; i <= 4; i++) {
                const y = mt + ph - (ph * i) / 4;
                const val = (fMax * i) / 4;
                g.fillText(val < 0.01 ? val.toExponential(0) : val.toFixed(2), ml - 5, y + 3);
            }
            g.textAlign = 'center';
            for (let i = 0; i <= 4; i++) {
                const x = ml + (pw * i) / 4;
                const val = rMin + ((rMax - rMin) * i) / 4;
                g.fillText(val.toFixed(2), x, mt + ph + 16);
            }

            const snapshotCharges = Array.isArray(reading?.chargesSnapshot) ? reading.chargesSnapshot : [];
            if (snapshotCharges.length >= 2) {
                const q1 = Math.abs(snapshotCharges[0].charge || 0);
                const q2 = Math.abs(snapshotCharges[1].charge || 0);
                g.setLineDash([5, 5]);
                g.strokeStyle = 'rgba(245,158,11,0.8)';
                g.lineWidth = 2;
                g.beginPath();
                let first = true;
                for (let px = 0; px <= pw; px += 2) {
                    const r = rMin + (rMax - rMin) * (px / pw);
                    if (r <= 0.005) continue;
                    const f = (K * q1 * q2) / (r * r);
                    const py = ph - (f / fMax) * ph;
                    if (!Number.isFinite(py) || py < -20) continue;
                    if (first) {
                        g.moveTo(ml + px, mt + py);
                        first = false;
                    } else {
                        g.lineTo(ml + px, mt + py);
                    }
                }
                g.stroke();
                g.setLineDash([]);
            }

            for (const pt of points) {
                const px = ml + ((pt.r - rMin) / (rMax - rMin)) * pw;
                const py = mt + ph - (pt.f / fMax) * ph;
                if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
                if (px < ml || px > ml + pw || py < mt - 8 || py > mt + ph + 8) continue;

                const isAttract = pt.type === 'attract';
                g.fillStyle = isAttract ? '#60a5fa' : '#f87171';
                g.beginPath();
                g.arc(px, py, 4, 0, Math.PI * 2);
                g.fill();
            }

            return gCanvas.toDataURL('image/jpeg', 0.9);
        };

        const headerBlock = makeBlock(`
            <div>
                <h1 style="margin:0 0 8px;font-size:12px; font-weight:700;">Coulombic Solution Report</h1>
                <p style="margin:0 0 6px;font-size:12px;">Generated: ${new Date().toLocaleString()}</p>
                <p style="margin:0 0 16px;font-size:12px;">Selected readings: ${selectedReadings.length}</p>
            </div>
        `);
        currentPage.appendChild(headerBlock);

        for (let i = 0; i < selectedReadings.length; i++) {
            const reading = selectedReadings[i];
            const entries = getReadingEntries(reading.id);
            // Debug: Log reading ID and entry count
            if (window && window.console) {
                console.log('[PDF Export] Reading ID:', reading.id, 'Entries:', entries.length, entries);
            }
            const label = getReadingLabel(reading.id, savedReadings.findIndex((x) => x.id === reading.id));
            const simulationImgData = buildSimulationSnapshotDataUrl(reading, entries);
            const graphImgData = buildGraphSnapshotDataUrl(entries, reading);

            const titleBlock = makeBlock(`
                <div style="margin:0 0 10px;">
                    <h2 style="margin:0 0 6px; font-size:12px; font-weight:700;">${label.title}</h2>
                    <p style="margin:0; font-size:12px;">${label.meta}</p>
                </div>
            `);
            ensureFitsOrNewPage(titleBlock);

            if (simulationImgData || graphImgData) {
                const figureBlock = makeBlock(`
                    <div style="margin:0 0 12px; padding:10px; border:1px solid #e5e7eb; border-radius:10px;">
                        <p style="margin:0 0 8px; font-size:12px; font-weight:700;">Reading Visual Snapshots</p>
                        ${simulationImgData
                            ? `<div style="margin:0 0 10px;"><p style="margin:0 0 5px; font-size:12px;">Simulation Scene</p><img src="${simulationImgData}" style="width:100%; height:auto; border-radius:8px; border:1px solid #dbeafe;" /></div>`
                            : ''}
                        ${graphImgData
                            ? `<div><p style="margin:0 0 5px; font-size:12px;">F vs r Graph</p><img src="${graphImgData}" style="width:100%; height:auto; border-radius:8px; border:1px solid #e2e8f0;" /></div>`
                            : ''}
                    </div>
                `);
                ensureFitsOrNewPage(figureBlock);
            }

            if (entries.length === 0) {
                const emptyBlock = makeBlock('<p style="margin:0 0 14px; font-size:12px;">No simulation rows are available for this reading in the data log.</p>');
                ensureFitsOrNewPage(emptyBlock);
                continue;
            }

            for (const item of entries) {
                // Each simulation gets its own dedicated page
                currentPage = makePage();
                pageHost.appendChild(currentPage);
                pages.push(currentPage);

                const interaction = item.type === 'attract' ? 'Attraction' : 'Repulsion';
                const potential = potentialEnergy(item.q1, item.q2, item.r);
                const simHeader = makeBlock(`
                    <div style="margin:0 0 6px; padding:8px 10px; border:1px solid #ddd; border-radius:8px;">
                        <p style="margin:0; font-size:18px; font-weight:700;">Simulation #${item.num} (${item.pair})</p>
                    </div>
                `);
                currentPage.appendChild(simHeader);

                // Helper to render LaTeX as SVG using KaTeX (if available)
                function renderMathSVG(latex) {
                    if (window.katex) {
                        try {
                            return window.katex.renderToString(latex, { output: 'svg', throwOnError: false });
                        } catch (e) {
                            return `<span>${latex}</span>`;
                        }
                    }
                    return `<span>${latex}</span>`;
                }

                const givenBlock = makeBlock(`
                    <div style="margin:0 0 6px; padding:8px 10px; border:1px solid #eee; border-radius:8px;">
                        <span style="font-size:16px;">Given: </span><span style="font-size:16px;">${renderMathSVG(`q_1=${formatSciLatex(item.q1)}\\,\\mathrm{C},\; q_2=${formatSciLatex(item.q2)}\\,\\mathrm{C},\; r=${item.r.toFixed(4)}\\,\\mathrm{m}`)}</span>
                    </div>
                `);
                currentPage.appendChild(givenBlock);

                const formulaBlock = makeBlock(`
                    <div style="margin:0 0 6px; padding:8px 10px; border:1px solid #eee; border-radius:8px;">
                        <div style="font-size:16px;">${renderMathSVG('F = k\\frac{|q_1q_2|}{r^2}')}</div>
                        <div style="font-size:16px;">${renderMathSVG('U = k\\frac{q_1q_2}{r}')}</div>
                    </div>
                `);
                currentPage.appendChild(formulaBlock);

                const substitutionBlock = makeBlock(`
                    <div style="margin:0 0 6px; padding:8px 10px; border:1px solid #eee; border-radius:8px;">
                        <div style="font-size:16px;">${renderMathSVG(`F = (8.9875\\times10^9)\\frac{|(${formatSciLatex(item.q1)})(${formatSciLatex(item.q2)})|}{(${item.r.toFixed(4)})^2}`)}</div>
                    </div>
                `);
                currentPage.appendChild(substitutionBlock);

                const resultBlock = makeBlock(`
                    <div style="margin:0 0 6px; padding:8px 10px; border:1px solid #eee; border-radius:8px;">
                        <div style="font-size:16px;">${renderMathSVG(`F = ${formatSciLatex(item.f)}\\,\\mathrm{N}`)}</div>
                        <div style="font-size:16px;">${renderMathSVG(`U = ${formatSciLatex(potential)}\\,\\mathrm{J}`)}</div>
                    </div>
                `);
                currentPage.appendChild(resultBlock);

                const explanationBlock = makeBlock(`
                    <div style="margin:0 0 10px; padding:8px 10px; border:1px solid #eee; border-radius:8px;">
                        <span style="font-size:16px;">Explanation: ${interaction}. ${interaction === 'Attraction' ? 'Opposite signs pull toward each other, and potential energy is usually negative.' : 'Same signs push away from each other, and potential energy is usually positive.'}</span>
                    </div>
                `);
                currentPage.appendChild(explanationBlock);
            }

            if (i !== selectedReadings.length - 1) {
                const divider = makeBlock('<hr style="border:none; border-top:1px dashed #bbb; margin:8px 0 12px;"/>');
                ensureFitsOrNewPage(divider);
            }
        }

        const cleanupExportArtifacts = () => {
            pageHost.remove();
            document.querySelectorAll('.html2canvas-container').forEach((el) => el.remove());
        };

        isExportingPdf = true;
        if (btnExportSolutionPdf) btnExportSolutionPdf.disabled = true;
        if (btnCloseSolutionBottom) btnCloseSolutionBottom.disabled = true;
        if (btnConfirmExportReadings) btnConfirmExportReadings.disabled = true;
        setExportButtonsLoading(true);
        showExportProgressOverlay();
        setAIStatus('exporting pdf');

        try {
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready.catch(() => {});
            }

            const doc = new jsPdfApi({ unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 24;
            const imgWidth = pageWidth - margin * 2;

            const totalPages = pages.length;
            for (let idx = 0; idx < totalPages; idx++) {
                const page = pages[idx];

                // Yield to keep UI responsive and update progress
                if (idx % 2 === 0) {
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                }

                const pageCanvas = await html2canvasApi(page, {
                    scale: 1.5,
                    backgroundColor: '#ffffff',
                    useCORS: true,
                    logging: false,
                    windowWidth: PAGE_W,
                    windowHeight: PAGE_H,
                    removeContainer: true,
                });

                if (!pageCanvas || pageCanvas.width < 10 || pageCanvas.height < 10) {
                    throw new Error('Captured canvas is empty');
                }

                const imgHeight = (pageCanvas.height * imgWidth) / pageCanvas.width;
                const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);

                if (idx > 0) doc.addPage();
                doc.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight, undefined, 'FAST');

                // Clean up page DOM as we go to reduce memory pressure
                page.remove();
            }

            doc.save(`coulomb-readings-${readingIds.length}-selected-${Date.now()}.pdf`);
            showAIActionToast(`PDF exported (${readingIds.length} reading${readingIds.length > 1 ? 's' : ''}).`);
            showExportDonePopup('Done Exporting');
        } catch (_err) {
            const fallbackText = buildPdfReportText();
            const fallbackDoc = new jsPdfApi({ unit: 'pt', format: 'a4' });
            const lines = fallbackDoc.splitTextToSize(fallbackText, 520);
            fallbackDoc.text(lines, 36, 42);
            fallbackDoc.save(`coulomb-readings-fallback-${Date.now()}.pdf`);
            showAIActionToast('Equation render failed; exported fallback PDF.');
            showExportDonePopup('Done Exporting');
        } finally {
            cleanupExportArtifacts();
            isExportingPdf = false;
            if (btnExportSolutionPdf) btnExportSolutionPdf.disabled = false;
            if (btnCloseSolutionBottom) btnCloseSolutionBottom.disabled = false;
            if (btnConfirmExportReadings) btnConfirmExportReadings.disabled = false;
            setExportButtonsLoading(false);
            hideExportProgressOverlay();
            setAIStatus('done');
        }
    }

    function exportCurrentSolutionAsPdf() {
        if (savedReadings.length === 0) {
            showAIActionToast('No saved readings yet. Save at least one reading first.');
            return;
        }
        openExportPicker();
    }

    async function confirmExportSelectedReadings() {
        if (!exportReadingList) return;

        if (exportPickerError) {
            exportPickerError.textContent = '';
            exportPickerError.style.display = 'none';
        }

        const selectedIds = Array.from(exportReadingList.querySelectorAll('.export-reading-check:checked'))
            .map((el) => el.value)
            .filter(Boolean);

        if (selectedIds.length === 0) {
            if (exportPickerError) {
                exportPickerError.textContent = 'Select at least one reading to export.';
                exportPickerError.style.display = 'block';
            } else {
                showAIActionToast('Select at least one reading to export.');
            }
            return;
        }

        closeExportPicker();
        await exportReadingsAsPdf(selectedIds);
    }

    function buildFocusPairExplanation() {
        const c1 = focusPair[0];
        const c2 = focusPair[1];
        if (!c1 || !c2) {
            return 'Add at least two charges first so I can explain their interaction.';
        }

        const q1 = c1.sign * c1.charge;
        const q2 = c2.sign * c2.charge;
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.hypot(dx, dy);
        const rMeters = pixelsToMeters(dist);
        const force = coulombForce(c1.charge, c2.charge, rMeters);
        const potential = potentialEnergy(q1, q2, rMeters);
        const interaction = c1.sign === c2.sign ? 'Repulsion' : 'Attraction';

        return [
            `Focused pair explanation (q${charges.indexOf(c1) + 1} and q${charges.indexOf(c2) + 1}):`,
            `Given: $q_1=${formatSciLatex(q1)}\\,\\mathrm{C}$, $q_2=${formatSciLatex(q2)}\\,\\mathrm{C}$, $r=${rMeters.toFixed(4)}\\,\\mathrm{m}$`,
            'Formula: $$F = k\\frac{|q_1q_2|}{r^2},\\quad U = k\\frac{q_1q_2}{r}$$',
            `Result: $$F = ${formatSciLatex(force)}\\,\\mathrm{N},\\quad U = ${formatSciLatex(potential)}\\,\\mathrm{J}$$`,
            `Explanation: ${interaction}. ${interaction === 'Attraction' ? 'Opposite signs pull toward each other.' : 'Same signs push away from each other.'}`,
        ].join('\n');
    }

    function getSelectedAIPrompt() {
        if (!aiPresetSelect) return '';

        const action = aiPresetSelect.value;
        if (action === 'summary-latest') {
            if (dataLog.length === 0) return '';
            const latest = dataLog[dataLog.length - 1];
            return `summary simulation ${latest.num}`;
        }

        if (action === 'summary-number') {
            const num = Number(aiSimulationSelect?.value);
            if (!Number.isFinite(num) || num < 1) return '';
            return `summary simulation ${Math.floor(num)}`;
        }

        if (action === 'quiz-generate') return '__QUIZ_GENERATE__';
        if (action === 'quiz-check') return '__QUIZ_CHECK__';
        if (action === 'explain-focus') return '__EXPLAIN_FOCUS__';

        return '';
    }

    function updateAIImageAttachmentUI() {
        if (!aiImageAttachment) return;
        const hasImage = typeof aiPastedImageDataUrl === 'string' && aiPastedImageDataUrl.length > 30;
        aiImageAttachment.classList.toggle('ai-image-attachment--hidden', !hasImage);
        if (hasImage && aiImageAttachmentLabel) {
            aiImageAttachmentLabel.textContent = 'Problem image attached';
        }
    }

    function clearAIImageAttachment() {
        aiPastedImageDataUrl = null;
        updateAIImageAttachmentUI();
    }

    function onAIPromptPaste(e) {
        const clipboardItems = e.clipboardData?.items;
        if (!clipboardItems || clipboardItems.length === 0) return;

        for (const item of clipboardItems) {
            if (!item.type || !item.type.startsWith('image/')) continue;

            const file = item.getAsFile();
            if (!file) continue;

            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                if (!result.startsWith('data:image/')) return;

                aiPastedImageDataUrl = result;
                updateAIImageAttachmentUI();
                setAIStatus('image attached');
                appendChatMessage('assistant', 'Image received. Click Solve and I will read the problem from the screenshot.');
            };
            reader.readAsDataURL(file);
            break;
        }
    }

    function setAIChatOpen(isOpen) {
        if (!aiChatWidget) return;
        aiChatWidget.classList.toggle('ai-chat-widget--hidden', !isOpen);
        if (aiFloatingLauncher) aiFloatingLauncher.style.opacity = isOpen ? '0.72' : '1';

        if (isOpen && aiPresetSelect) {
            updateAIPresetInputs();
            setTimeout(() => aiPresetSelect.focus(), 120);
        }
    }

    function appendChatMessage(role, text) {
        if (!aiResponse) return null;

        const bubble = document.createElement('div');
        bubble.className = `ai-msg ai-msg--${role}`;
        if (role === 'assistant') {
            bubble.textContent = formatAssistantText(text);
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(bubble, {
                    throwOnError: false,
                    strict: 'ignore',
                    errorColor: '#d6dcff',
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true },
                    ],
                });
            }
        } else {
            bubble.textContent = text;
        }
        aiResponse.appendChild(bubble);
        aiResponse.scrollTop = aiResponse.scrollHeight;
        return bubble;
    }

    function renderMathMarkup(containerEl) {
        if (!containerEl || typeof renderMathInElement !== 'function') return;

        renderMathInElement(containerEl, {
            throwOnError: false,
            strict: 'ignore',
            errorColor: '#d6dcff',
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true },
            ],
        });
    }

    function stripBrokenDelimiterPairs(text, left, right) {
        const leftPattern = new RegExp(left.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const rightPattern = new RegExp(right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const leftCount = (text.match(leftPattern) || []).length;
        const rightCount = (text.match(rightPattern) || []).length;

        if (leftCount === rightCount) return text;
        return text.split(left).join('').split(right).join('');
    }

    function toSubscriptDigits(numText) {
        const map = {
            '0': '₀',
            '1': '₁',
            '2': '₂',
            '3': '₃',
            '4': '₄',
            '5': '₅',
            '6': '₆',
            '7': '₇',
            '8': '₈',
            '9': '₉',
        };

        return String(numText)
            .split('')
            .map((ch) => map[ch] || ch)
            .join('');
    }

    function formatAssistantText(rawText) {
        if (!rawText) return '';

        let formatted = String(rawText)
            .replace(/^\s{0,3}#{1,6}\s*/gm, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n');

        // Keep math delimiters so KaTeX can render formulas in chat messages.
        formatted = stripBrokenDelimiterPairs(formatted, '$$', '$$');
        formatted = stripBrokenDelimiterPairs(formatted, '$', '$');
        formatted = stripBrokenDelimiterPairs(formatted, '\\(', '\\)');
        formatted = stripBrokenDelimiterPairs(formatted, '\\[', '\\]');
        formatted = formatted
            .replace(/([=:]\s*)-\s*-\s*(\d)/g, '$1-$2')
            .replace(/([=:]\s*)\+\s*\+\s*(\d)/g, '$1+$2')
            .replace(/\bq_(\d+)\b/g, (_m, idx) => `q${toSubscriptDigits(idx)}`)
            .trim();

        return formatted;
    }

    function parseSimulationCommand(prompt) {
        const text = String(prompt || '').trim();

        // Case -2: summary requests, e.g.
        // "summary of simulation 1", "explain sim 3", "simulation 4 summary"
        const summaryMatch =
            text.match(/\b(?:summary|summarize|explain|solution|solve)\b[\s\S]*?\b(?:simulation|sim|entry|log)\s*(\d+)\b/i)
            || text.match(/\b(?:simulation|sim|entry|log)\s*(\d+)\b[\s\S]*?\b(?:summary|summarize|explain|solution|solve)\b/i);

        if (summaryMatch) {
            return {
                type: 'summarize-data-log',
                entryNum: Number(summaryMatch[1]),
            };
        }

        // Case -1: remove/delete charge requests, e.g.
        // "remove charge 3", "delete charges 2 and 4"
        if (/\b(remove|delete)\b[\s\S]*?\bcharge(?:s)?\b/i.test(text)) {
            if (/\b(all)\b/i.test(text)) {
                return {
                    type: 'remove-charge-batch',
                    removeIndices: Array.from({ length: charges.length }, (_v, i) => i + 1),
                };
            }

            if (/\b(both)\b/i.test(text)) {
                return {
                    type: 'remove-charge-batch',
                    removeIndices: Array.from({ length: Math.min(2, charges.length) }, (_v, i) => i + 1),
                };
            }

            const removeMatch = text.match(/\b(?:remove|delete)\b[\s\S]*?\bcharge(?:s)?\b\s*([\d\s,;&and]+)/i);
            const removeIndices = removeMatch?.[1]?.match(/\d+/g)?.map(Number) || [];
            if (removeIndices.length > 0) {
                return {
                    type: 'remove-charge-batch',
                    removeIndices: Array.from(new Set(removeIndices)),
                };
            }
        }

        // Case 0: add/create charge requests, e.g.
        // "add one charge with 8 microcoulombs"
        if (/\b(add|create|insert|place)\b[\s\S]*?\bcharge(?:s)?\b/i.test(text)) {
            const countMatch = text.match(/\b(?:add|create|insert|place)\b[\s\S]*?\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b[\s\S]*?\bcharge(?:s)?\b/i);
            let count = 1;
            if (countMatch) {
                const token = String(countMatch[1]).toLowerCase();
                const tokenMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
                count = tokenMap[token] || Number(token);
            }

            count = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;

            const unitValueMatch = text.match(/([+-]?\d+(?:\.\d+)?)\s*(?:micro\s*coulomb(?:s)?|microcoulomb(?:s)?|uC|μC)\b/i);
            let valueMicroC = Number.NaN;
            if (unitValueMatch) valueMicroC = Number(unitValueMatch[1]);

            let sign = 1;
            if (/\b(negative|minus)\b/i.test(text)) sign = -1;
            if (/\b(positive|plus)\b/i.test(text)) sign = 1;
            if (Number.isFinite(valueMicroC) && valueMicroC < 0) sign = -1;

            return {
                type: 'add-charge',
                count,
                sign,
                valueMicroC: Number.isFinite(valueMicroC) ? Math.abs(valueMicroC) : null,
            };
        }

        // Case A: explicit per-charge assignments, e.g.
        // "charge 1 to 8 and charge 2 to -3"
        const explicitUpdates = [];
        const explicitPattern = /(?:charge|q)\s*(\d+)\s*(?:to|in|=)\s*([+-]?\d+(?:\.\d+)?)/gi;
        let explicitMatch;
        while ((explicitMatch = explicitPattern.exec(text)) !== null) {
            const idx = Number(explicitMatch[1]);
            const val = Number(explicitMatch[2]);
            if (Number.isFinite(idx) && Number.isFinite(val)) {
                explicitUpdates.push({ chargeIndex: idx, valueMicroC: val });
            }
        }

        if (explicitUpdates.length > 0) {
            const latestByIndex = new Map();
            for (const upd of explicitUpdates) latestByIndex.set(upd.chargeIndex, upd.valueMicroC);
            return {
                type: 'set-charge-batch',
                updates: Array.from(latestByIndex.entries()).map(([chargeIndex, valueMicroC]) => ({ chargeIndex, valueMicroC })),
            };
        }

        // Case B: group update, e.g.
        // "change charge of 1 and 2 to 10", "set charges 1,2,3 = -4"
        const groupPattern = /(?:change|set|update|make)[^\n]*?(?:charge|charges)(?:\s+of)?\s*([\d\s,;&and]+?)\s*(?:to|in|=)\s*([+-]?\d+(?:\.\d+)?)/i;
        const groupMatch = text.match(groupPattern);
        if (groupMatch) {
            const indexMatches = groupMatch[1].match(/\d+/g) || [];
            const valueMicroC = Number(groupMatch[2]);
            if (indexMatches.length > 0 && Number.isFinite(valueMicroC)) {
                return {
                    type: 'set-charge-batch',
                    updates: Array.from(new Set(indexMatches.map(Number))).map((chargeIndex) => ({
                        chargeIndex,
                        valueMicroC,
                    })),
                };
            }
        }

        // Case C: keyword-based batch update, e.g.
        // "change both charge to 7", "set all charges to -2"
        const bothPattern = /(?:change|set|update|make)[^\n]*?\bboth\b[^\n]*?charge(?:s)?\s*(?:to|in|=)\s*([+-]?\d+(?:\.\d+)?)/i;
        const bothMatch = text.match(bothPattern);
        if (bothMatch) {
            const valueMicroC = Number(bothMatch[1]);
            if (Number.isFinite(valueMicroC)) {
                const max = Math.min(2, charges.length);
                return {
                    type: 'set-charge-batch',
                    updates: Array.from({ length: max }, (_v, i) => ({
                        chargeIndex: i + 1,
                        valueMicroC,
                    })),
                };
            }
        }

        const allPattern = /(?:change|set|update|make)[^\n]*?\ball\b[^\n]*?charge(?:s)?\s*(?:to|in|=)\s*([+-]?\d+(?:\.\d+)?)/i;
        const allMatch = text.match(allPattern);
        if (allMatch) {
            const valueMicroC = Number(allMatch[1]);
            if (Number.isFinite(valueMicroC) && charges.length > 0) {
                return {
                    type: 'set-charge-batch',
                    updates: Array.from({ length: charges.length }, (_v, i) => ({
                        chargeIndex: i + 1,
                        valueMicroC,
                    })),
                };
            }
        }

        if (/\b(different|not\s+equal|not\s+same|opposite)\b/i.test(text)) {
            return { type: 'make-different' };
        }

        // Case D: explicit request for opposite signs with equal magnitude.
        if (/\b(one|1)\s+positive\b/i.test(text)
            && /\b(one|1)\s+negative\b/i.test(text)
            && /\b(same|equal)\b/i.test(text)) {
            return { type: 'set-opposite-equal' };
        }

        const equalMatch = text.match(/\b(equal|same)\b[^\n]*?(?:to|in|=)?\s*([+-]?\d+(?:\.\d+)?)?/i);
        if (equalMatch) {
            const parsed = Number(equalMatch[2]);
            return {
                type: 'make-equal',
                valueMicroC: Number.isFinite(parsed) ? parsed : null,
            };
        }

        return null;
    }

    function extractFirstJsonObject(raw) {
        if (!raw) return null;

        const noFence = String(raw)
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

        try {
            return JSON.parse(noFence);
        } catch (_e) {
            const start = noFence.indexOf('{');
            const end = noFence.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    return JSON.parse(noFence.slice(start, end + 1));
                } catch (_e2) {
                    return null;
                }
            }
            return null;
        }
    }

    function normalizeInferredCommand(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const type = String(raw.type || '').trim();
        if (!type || type === 'none') return null;

        if (type === 'set-charge-batch') {
            const updates = Array.isArray(raw.updates) ? raw.updates : [];
            return {
                type,
                updates: updates.map((u) => ({
                    chargeIndex: Number(u.chargeIndex),
                    valueMicroC: Number(u.valueMicroC),
                })),
            };
        }

        if (type === 'set-sign-batch') {
            const signUpdates = Array.isArray(raw.signUpdates) ? raw.signUpdates : [];
            return {
                type,
                signUpdates: signUpdates.map((u) => ({
                    chargeIndex: Number(u.chargeIndex),
                    sign: Number(u.sign),
                })),
            };
        }

        if (type === 'remove-charge-batch') {
            const removeIndices = Array.isArray(raw.removeIndices) ? raw.removeIndices : [];
            return {
                type,
                removeIndices: removeIndices.map((idx) => Number(idx)),
            };
        }

        if (type === 'add-charge') {
            const parsedCount = Number(raw.count);
            const parsedSign = Number(raw.sign);
            const parsedValue = Number(raw.valueMicroC);
            return {
                type,
                count: Number.isFinite(parsedCount) ? parsedCount : 1,
                sign: parsedSign === -1 ? -1 : 1,
                valueMicroC: Number.isFinite(parsedValue) ? Math.abs(parsedValue) : null,
            };
        }

        if (type === 'make-different') return { type };
        if (type === 'make-equal') {
            const rawValue = raw.valueMicroC;
            const maybeValue =
                rawValue === null || rawValue === undefined || rawValue === ''
                    ? NaN
                    : Number(rawValue);
            return {
                type,
                valueMicroC: Number.isFinite(maybeValue) ? maybeValue : null,
            };
        }

        if (type === 'set-opposite-equal') return { type };

        return null;
    }

    async function inferSimulationCommandWithAI(prompt) {
        const actionPrompt = [
            'Convert this user request into simulation action JSON.',
            'Return ONLY valid JSON, no extra text.',
            'Allowed types: add-charge, remove-charge-batch, set-charge-batch, set-sign-batch, make-different, make-equal, none.',
            'If the request is a greeting, casual chat, or question without explicit state-change intent, return {"type":"none"}.',
            'Schema:',
            '{"type":"add-charge|remove-charge-batch|set-charge-batch|set-sign-batch|make-different|make-equal|none","count":1,"sign":1,"removeIndices":[3],"updates":[{"chargeIndex":1,"valueMicroC":8}],"signUpdates":[{"chargeIndex":2,"sign":-1}],"valueMicroC":null}',
            `User request: ${prompt}`,
            `Current state: ${JSON.stringify(buildPhysicsContext())}`,
        ].join('\n');

        const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: actionPrompt,
                context: buildPhysicsContext(),
            }),
        });

        if (!res.ok) return null;
        const data = await res.json();
        return normalizeInferredCommand(extractFirstJsonObject(data.answer));
    }

    function isLikelySimulationMutationPrompt(prompt) {
        const text = String(prompt || '').trim();
        if (!text || text.length < 3) return false;

        const hasDirectAssignment = /(?:charge|q)?\s*\d+\s*(?:to|in|=)\s*[+-]?\d+(?:\.\d+)?/i.test(text);
        const hasMutationVerb = /\b(set|change|update|make|adjust|modify|turn|switch|apply|add|create|insert|place|remove|delete)\b/i.test(text);
        const hasChargeDomain = /\b(charge|charges|q\s*\d+|positive|negative|equal|same|different|opposite|magnitude|both|all)\b/i.test(text);

        return hasDirectAssignment || (hasMutationVerb && hasChargeDomain);
    }

    function parseMagnitudeWithUnit(rawValue, rawUnit) {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) return null;

        const unit = String(rawUnit || 'C').toLowerCase();
        if (unit === 'c' || unit === 'coulomb' || unit === 'coulombs') return value;
        if (unit === 'mc') return value * 1e-3;
        if (unit === 'uc' || unit === 'microcoulomb' || unit === 'microcoulombs' || unit === 'μc') return value * 1e-6;
        if (unit === 'nc') return value * 1e-9;
        if (unit === 'pc') return value * 1e-12;
        return null;
    }

    function normalizeProblemText(problemText) {
        const superscriptMap = {
            '⁰': '0',
            '¹': '1',
            '²': '2',
            '³': '3',
            '⁴': '4',
            '⁵': '5',
            '⁶': '6',
            '⁷': '7',
            '⁸': '8',
            '⁹': '9',
            '⁻': '-',
            '⁺': '+',
        };

        let text = String(problemText || '')
            .replace(/μ/g, 'u')
            .replace(/−/g, '-')
            .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (ch) => superscriptMap[ch] || ch);

        // Normalize forms like 4 × 10^-8, 4x10-8, 4 * 10^ -8 into 4e-8.
        text = text.replace(/(\d*\.?\d+)\s*[x×*]\s*10\s*\^?\s*([+-]?\d+)/gi, '$1e$2');
        return text;
    }

    function parseDistanceWithUnit(rawValue, rawUnit) {
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value <= 0) return null;

        const unit = String(rawUnit || 'm').toLowerCase();
        if (unit === 'm' || unit === 'meter' || unit === 'meters') return value;
        if (unit === 'cm') return value / 100;
        if (unit === 'mm') return value / 1000;
        return null;
    }

    function parseForceWithUnit(rawValue, rawUnit) {
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value <= 0) return null;

        const unit = String(rawUnit || 'n').toLowerCase();
        if (unit === 'n' || unit === 'newton' || unit === 'newtons') return value;
        return null;
    }

    function parseChargeTokenValue(token) {
        if (!token) return null;
        const match = token.match(/([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(c|mc|uc|μc|nc|pc|coulomb|coulombs|microcoulomb|microcoulombs)/i);
        if (!match) return null;
        return parseMagnitudeWithUnit(match[1], match[2]);
    }

    function inferChargeSign(fullText, nearbyToken, fallbackValue) {
        if (/[−-]\s*$/.test(nearbyToken) || /^\s*[−-]/.test(nearbyToken)) return -1;
        if (/\bnegative\b/i.test(nearbyToken)) return -1;
        if (/\bpositive\b/i.test(nearbyToken)) return 1;

        if (Number.isFinite(fallbackValue)) {
            if (fallbackValue < 0) return -1;
            if (fallbackValue > 0) return 1;
        }

        if (/\bq\s*1\b[^.\n]*\bnegative\b/i.test(fullText) && /q\s*1/i.test(nearbyToken)) return -1;
        if (/\bq\s*2\b[^.\n]*\bnegative\b/i.test(fullText) && /q\s*2/i.test(nearbyToken)) return -1;
        return 1;
    }

    function extractWordProblemLocally(problemText) {
        const text = normalizeProblemText(problemText);
        if (!text.trim()) return null;

        const chargeMatches = Array.from(
            text.matchAll(/([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(c|mc|uc|nc|pc|coulomb|coulombs|microcoulomb|microcoulombs)/ig)
        );

        const chargesC = [];
        for (const match of chargeMatches) {
            const signedValue = parseMagnitudeWithUnit(match[1], match[2]);
            if (!Number.isFinite(signedValue)) continue;
            const sign = inferChargeSign(text, match[0], signedValue);
            chargesC.push(sign * Math.abs(signedValue));
        }

        const distanceMatch =
            text.match(/(?:distance|separation|r|apart)\s*(?:=|is|of|:)??\s*([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(m|cm|mm|meter|meters)/i)
            || text.match(/([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(m|cm|mm|meter|meters)\s*apart/i)
            || text.match(/\b([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(m|cm|mm|meter|meters)\b/i);

        const distanceM = distanceMatch ? parseDistanceWithUnit(distanceMatch[1], distanceMatch[2]) : null;

        const forceMatch =
            text.match(/(?:electric\s+force|electrostatic\s+force|force)\s*(?:=|is|of|:)??\s*([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(n|newton|newtons)\b/i)
            || text.match(/([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(n|newton|newtons)\b/i);
        const forceN = forceMatch ? parseForceWithUnit(forceMatch[1], forceMatch[2]) : null;

        const asksUnknownCharge = /(second\s+charge|other\s+charge|find\s+q\s*2|find\s+q2|value\s+of\s+q\s*2|value\s+of\s+the\s+second\s+charge|unknown\s+charge)/i.test(text);

        if (chargesC.length < 1) {
            return null;
        }

        let target = 'force';
        if (/\b(distance|separation|how\s+far|apart)\b/i.test(text)) target = 'distance';
        if (asksUnknownCharge) target = 'charge';
        if (/potential\s*energy|\bpe\b|\bjoule\b|\benergy\b/i.test(text)) target = 'potential_energy';
        if (/\bboth\b/i.test(text)) target = 'both';

        // Support "find force" even when user uses plain sentence style.
        const asksForce = /\b(force|electric\s+force|electrostatic\s+force)\b/i.test(text);
        if (!asksUnknownCharge && asksForce && Number.isFinite(distanceM)) {
            target = 'force';
        }

        if (target === 'charge' && (!Number.isFinite(forceN) || !Number.isFinite(distanceM))) {
            return null;
        }

        if ((target === 'force' || target === 'distance' || target === 'potential_energy' || target === 'both') && chargesC.length < 2) {
            return null;
        }

        return {
            chargesC,
            distanceM,
            forceN,
            target,
        };
    }

    function normalizeInferredProblem(raw) {
        if (!raw || typeof raw !== 'object') return null;

        let chargesC = [];
        if (Array.isArray(raw.chargesC)) {
            chargesC = raw.chargesC.map((v) => Number(v)).filter((v) => Number.isFinite(v));
        }

        if (chargesC.length < 1) {
            const q1 = Number(raw.q1C);
            const q2 = Number(raw.q2C);
            if (Number.isFinite(q1) && Number.isFinite(q2)) {
                chargesC = [q1, q2];
            }
        }

        const distance = Number(raw.distanceM);
        const forceN = Number(raw.forceN);

        if (chargesC.length < 1) {
            return null;
        }

        const allowedTargets = new Set(['force', 'distance', 'charge', 'potential_energy', 'both']);
        const target = allowedTargets.has(String(raw.target || '').toLowerCase())
            ? String(raw.target).toLowerCase()
            : 'force';

        const hasDistance = Number.isFinite(distance) && distance > 0;
        const hasForce = Number.isFinite(forceN) && forceN > 0;

        const nonZeroCharges = chargesC.filter((q) => Math.abs(q) > 1e-30);

        if ((target === 'force' || target === 'potential_energy' || target === 'both') && !hasDistance) {
            return null;
        }

        if (target === 'distance' && !hasForce) {
            return null;
        }

        if ((target === 'force' || target === 'distance' || target === 'potential_energy' || target === 'both') && nonZeroCharges.length < 2) {
            return null;
        }

        if (target === 'charge' && (!hasDistance || !hasForce || nonZeroCharges.length < 1)) {
            return null;
        }

        return {
            chargesC,
            distanceM: hasDistance ? distance : null,
            forceN: hasForce ? forceN : null,
            target,
        };
    }

    async function inferWordProblemWithAI(problemText, imageDataUrl = null) {
        const extractionPrompt = [
            'Extract Coulomb-law word problem values as strict JSON only.',
            'Return only this JSON schema: {"chargesC":[number],"distanceM":number|null,"forceN":number|null,"target":"force|distance|charge|potential_energy|both"}.',
            'If the prompt uses q1/q2 form, still convert it into chargesC with both values.',
            'If the prompt asks for unknown second charge (q2), set target to "charge" and include only known charge(s) in chargesC.',
            'Convert all units to Coulombs and meters.',
            'Use signed charge values (negative when stated).',
            'If fields are missing or ambiguous, return {"chargesC":[],"distanceM":null,"forceN":null,"target":"force"}.',
            imageDataUrl ? 'A problem image is attached; extract values from it first.' : 'Use the text problem for extraction.',
            `Problem text: ${problemText}`,
        ].join('\n');

        const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: extractionPrompt,
                context: buildPhysicsContext(),
                imageDataUrl: imageDataUrl || null,
            }),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const parsed = extractFirstJsonObject(data.answer);
        return normalizeInferredProblem(parsed);
    }

    function solveProblemInputs(problem) {
        const chargeValues = Array.isArray(problem?.chargesC)
            ? problem.chargesC.map((v) => Number(v)).filter((v) => Number.isFinite(v))
            : [];
        if (chargeValues.length < 1) return null;

        const target = String(problem.target || 'force').toLowerCase();
        const forceN = Number(problem.forceN);
        const distanceM = Number(problem.distanceM);

        if (target === 'charge') {
            if (chargeValues.length < 1 || !Number.isFinite(forceN) || forceN <= 0 || !Number.isFinite(distanceM) || distanceM <= 0) return null;

            const qKnown = Math.abs(chargeValues[0]);
            if (qKnown <= 0) return null;

            const qUnknownMag = (forceN * distanceM * distanceM) / (K * qKnown);
            if (!Number.isFinite(qUnknownMag) || qUnknownMag <= 0) return null;

            const qKnownSigned = chargeValues[0];
            const qUnknownSigned = qUnknownMag; // sign cannot be inferred from force magnitude alone

            return {
                ...problem,
                chargesC: [qKnownSigned, qUnknownSigned],
                distanceM,
                forceN,
                target,
                solvedUnknownChargeC: qUnknownMag,
            };
        }

        if (chargeValues.length < 2) return null;

        if (target === 'distance') {
            if (chargeValues.length !== 2 || !Number.isFinite(forceN) || forceN <= 0) return null;
            const q1 = Math.abs(chargeValues[0]);
            const q2 = Math.abs(chargeValues[1]);
            const solvedDistance = Math.sqrt((K * q1 * q2) / forceN);
            if (!Number.isFinite(solvedDistance) || solvedDistance <= 0) return null;

            return {
                ...problem,
                chargesC: chargeValues,
                distanceM: solvedDistance,
                forceN,
                target,
            };
        }

        if (!Number.isFinite(distanceM) || distanceM <= 0) return null;

        const solvedForce = chargeValues.length === 2
            ? coulombForce(Math.abs(chargeValues[0]), Math.abs(chargeValues[1]), distanceM)
            : null;

        return {
            ...problem,
            chargesC: chargeValues,
            distanceM,
            forceN: Number.isFinite(solvedForce) ? solvedForce : (Number.isFinite(forceN) ? forceN : null),
            target,
        };
    }

    function fallbackExtractSimpleForceProblem(promptText) {
        const text = normalizeProblemText(promptText);
        const chargeMatches = Array.from(
            text.matchAll(/([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(c|mc|uc|nc|pc|coulomb|coulombs|microcoulomb|microcoulombs)\b/ig)
        );
        if (chargeMatches.length < 2) return null;

        const q1 = parseMagnitudeWithUnit(chargeMatches[0][1], chargeMatches[0][2]);
        const q2 = parseMagnitudeWithUnit(chargeMatches[1][1], chargeMatches[1][2]);
        if (!Number.isFinite(q1) || !Number.isFinite(q2)) return null;

        const distMatch = text.match(/\b([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(m|cm|mm|meter|meters)\b/i);
        if (!distMatch) return null;
        const distanceM = parseDistanceWithUnit(distMatch[1], distMatch[2]);
        if (!Number.isFinite(distanceM)) return null;

        return {
            chargesC: [q1, q2],
            distanceM,
            forceN: null,
            target: 'force',
        };
    }

    function setScenarioFromProblem(problem) {
        const chargeValues = Array.isArray(problem?.chargesC)
            ? problem.chargesC.map((v) => Number(v)).filter((v) => Number.isFinite(v))
            : [];
        const distanceM = Number(problem.distanceM);
        if (chargeValues.length < 2 || !Number.isFinite(distanceM) || distanceM <= 0) return false;

        const minCenterPadding = CHARGE_RADIUS + 20;
        const centerY = canvas.height / 2;
        const centerX = canvas.width / 2;

        if (chargeValues.length === 2) {
            const maxHalfSepPx = Math.max(16, Math.min(centerX - minCenterPadding, canvas.width - centerX - minCenterPadding));
            const requestedHalfSepPx = metersToPixels(distanceM) / 2;
            const halfSepPx = clamp(requestedHalfSepPx, 16, maxHalfSepPx);

            charges = [
                {
                    id: 1,
                    x: centerX - halfSepPx,
                    y: centerY,
                    charge: Math.abs(chargeValues[0]),
                    sign: chargeValues[0] < 0 ? -1 : 1,
                },
                {
                    id: 2,
                    x: centerX + halfSepPx,
                    y: centerY,
                    charge: Math.abs(chargeValues[1]),
                    sign: chargeValues[1] < 0 ? -1 : 1,
                },
            ];

            nextChargeId = 3;
            updateFocusPair();
            render();
            return true;
        }

        const n = chargeValues.length;
        const maxRadius = Math.max(30, Math.min(canvas.width, canvas.height) / 2 - minCenterPadding);
        const desiredAdjacentPx = Math.max(24, metersToPixels(distanceM));
        const baseRadius = desiredAdjacentPx / (2 * Math.sin(Math.PI / n));
        const radius = clamp(baseRadius, 30, maxRadius);
        const startAngle = -Math.PI / 2;

        charges = chargeValues.map((q, index) => {
            const angle = startAngle + (2 * Math.PI * index) / n;
            return {
                id: index + 1,
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
                charge: Math.abs(q),
                sign: q < 0 ? -1 : 1,
            };
        });

        nextChargeId = n + 1;
        updateFocusPair();
        render();
        return true;
    }

    function buildProblemSolutionHTML(problem) {
        const chargeValues = Array.isArray(problem?.chargesC)
            ? problem.chargesC.map((v) => Number(v)).filter((v) => Number.isFinite(v))
            : [];
        const r = Number(problem.distanceM);
        const forceGiven = Number(problem.forceN);
        const solvedUnknownChargeC = Number(problem.solvedUnknownChargeC);
        const target = String(problem.target || 'force').toLowerCase();

        if (chargeValues.length < 2 || !Number.isFinite(r) || r <= 0) {
            return '<div class="solution-pair-card"><div class="solution-pair-body"><div class="solution-step-content">No complete problem values were found.</div></div></div>';
        }

        if (chargeValues.length > 2) {
            const pairRows = [];
            for (let i = 0; i < charges.length; i++) {
                for (let j = i + 1; j < charges.length; j++) {
                    const qi = charges[i].sign * charges[i].charge;
                    const qj = charges[j].sign * charges[j].charge;
                    const distM = pixelsToMeters(Math.hypot(charges[j].x - charges[i].x, charges[j].y - charges[i].y));
                    const fPair = coulombForce(Math.abs(qi), Math.abs(qj), distM);
                    const uPair = potentialEnergy(qi, qj, distM);
                    const relation = qi * qj < 0 ? 'Attract' : 'Repel';

                    pairRows.push(`
                        <tr>
                            <td>q${i + 1}-q${j + 1}</td>
                            <td>${distM.toFixed(3)} m</td>
                            <td>${formatSciSolution(fPair)} N</td>
                            <td>${formatSciSolution(uPair)} J</td>
                            <td>${relation}</td>
                        </tr>`);
                }
            }

            return `
            <div class="solution-pair-card">
                <div class="solution-pair-header">
                    <span class="solution-pair-label">
                        <span class="material-symbols-outlined">auto_awesome</span>
                        Problem Solver Result
                    </span>
                    <span class="solution-pair-type solution-pair-type--attract">${chargeValues.length} Charges</span>
                </div>
                <div class="solution-pair-body">
                    <div class="solution-step">
                        <div class="solution-step-label"><span class="step-num">1</span> Applied Setup</div>
                        <div class="solution-step-content">
                            Parsed and applied <strong>${chargeValues.length}</strong> charges to the simulation.<br>
                            Requested spacing reference: <strong>${r.toFixed(4)} m</strong>.
                        </div>
                    </div>
                    <div class="solution-step">
                        <div class="solution-step-label"><span class="step-num">2</span> Pairwise Solution Table</div>
                        <div class="solution-step-content" style="overflow:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:11px;">
                                <thead>
                                    <tr>
                                        <th style="text-align:left; padding:6px 4px; border-bottom:1px solid var(--border-subtle);">Pair</th>
                                        <th style="text-align:left; padding:6px 4px; border-bottom:1px solid var(--border-subtle);">r</th>
                                        <th style="text-align:left; padding:6px 4px; border-bottom:1px solid var(--border-subtle);">F</th>
                                        <th style="text-align:left; padding:6px 4px; border-bottom:1px solid var(--border-subtle);">U</th>
                                        <th style="text-align:left; padding:6px 4px; border-bottom:1px solid var(--border-subtle);">Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${pairRows.join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        const q1 = chargeValues[0];
        const q2 = chargeValues[1];

        const f = coulombForce(Math.abs(q1), Math.abs(q2), r);
        const pe = potentialEnergy(q1, q2, r);
        const interaction = q1 * q2 < 0 ? 'Attraction' : 'Repulsion';
        const interactionClass = interaction === 'Attraction' ? 'solution-pair-type--attract' : 'solution-pair-type--repel';

        const q1Display = formatSciSolution(q1);
        const q2Display = formatSciSolution(q2);
        const q1Latex = formatSciLatex(q1);
        const q2Latex = formatSciLatex(q2);
        const rDisplay = r.toFixed(4);
        const productAbs = Math.abs(q1 * q2);
        const productAbsLatex = formatSciLatex(productAbs);
        const forceGivenLatex = Number.isFinite(forceGiven) ? formatSciLatex(forceGiven) : null;

        let resultBlock = `
            <span class="result-highlight">F = ${formatSciSolution(f)} N</span><br>
            Type: <strong>${interaction}</strong><br>
            Rule: ${interaction === 'Attraction' ? 'Opposite signs attract.' : 'Like signs repel.'}
        `;

        if (target === 'potential_energy') {
            resultBlock = `
                <span class="result-highlight ${pe >= 0 ? 'pe-positive' : 'pe-negative'}">U = ${formatSciSolution(pe)} J</span><br>
                Type: <strong>${interaction}</strong><br>
                Sign meaning: ${pe >= 0 ? 'Positive energy suggests a repulsive configuration.' : 'Negative energy suggests an attractive configuration.'}
            `;
        }

        if (target === 'both') {
            resultBlock = `
                <span class="result-highlight">F = ${formatSciSolution(f)} N</span><br>
                <span class="result-highlight ${pe >= 0 ? 'pe-positive' : 'pe-negative'}">U = ${formatSciSolution(pe)} J</span><br>
                Type: <strong>${interaction}</strong>
            `;
        }

        if (target === 'distance') {
            resultBlock = `
                <span class="result-highlight">r = ${rDisplay} m</span><br>
                Given: <strong>F = ${formatSciSolution(forceGiven)} N</strong><br>
                Rearranged: r = sqrt(k|q1q2|/F)
            `;
        }

        if (target === 'charge') {
            resultBlock = `
                <span class="result-highlight">|q2| = ${formatSciSolution(solvedUnknownChargeC)} C</span><br>
                Given: <strong>F = ${formatSciSolution(forceGiven)} N</strong><br>
                Rearranged: |q2| = (F r²) / (k |q1|)<br>
                Note: force magnitude alone does not determine the sign of q2.
            `;
        }

        return `
        <div class="solution-pair-card">
            <div class="solution-pair-header">
                <span class="solution-pair-label">
                    <span class="material-symbols-outlined">auto_awesome</span>
                    Problem Solver Result
                </span>
                <span class="solution-pair-type ${interactionClass}">${interaction}</span>
            </div>
            <div class="solution-pair-body">
                <div class="solution-step">
                    <div class="solution-step-label"><span class="step-num">1</span> Given</div>
                    <div class="solution-step-content">
                        <span class="formula-highlight">q1</span> = <span class="value-highlight">${q1Display} C</span><br>
                        <span class="formula-highlight">q2</span> = <span class="value-highlight">${q2Display} C</span><br>
                        <span class="formula-highlight">r</span> = <span class="value-highlight">${rDisplay} m</span><br>
                        ${Number.isFinite(forceGiven) ? `<span class="formula-highlight">F</span> = <span class="value-highlight">${formatSciSolution(forceGiven)} N</span><br>` : ''}
                        <span class="formula-highlight">k</span> = 8.9875 × 10<sup>9</sup> N·m²/C²
                    </div>
                </div>

                <div class="solution-step">
                    <div class="solution-step-label"><span class="step-num">2</span> Formula</div>
                    <div class="solution-step-content">
                        $$F = k\\frac{|q_1q_2|}{r^2}$$
                        $$r = \\sqrt{k\\frac{|q_1q_2|}{F}}$$
                        $$|q_2| = \\frac{Fr^2}{k|q_1|}$$
                        $$U = k\\frac{q_1q_2}{r}$$
                    </div>
                </div>

                <div class="solution-step">
                    <div class="solution-step-label"><span class="step-num">3</span> Substitute</div>
                    <div class="solution-step-content">
                        $$|q_1q_2| = ${productAbsLatex}\,\mathrm{C^2}$$
                        $$F = (8.9875 \times 10^9)\frac{${productAbsLatex}}{(${rDisplay})^2}$$
                        ${Number.isFinite(forceGiven) ? `$$r = \sqrt{(8.9875 \times 10^9)\frac{${productAbsLatex}}{${forceGivenLatex}}}$$` : ''}
                        ${target === 'charge' && Number.isFinite(forceGiven)
                            ? `$$|q_2| = \frac{(${forceGivenLatex})(${rDisplay})^2}{(8.9875 \times 10^9)|${q1Latex}|}$$`
                            : ''}
                        $$U = (8.9875 \times 10^9)\frac{(${q1Latex})(${q2Latex})}{${rDisplay}}$$
                    </div>
                </div>

                <div class="solution-divider"></div>

                <div class="solution-step">
                    <div class="solution-step-label"><span class="step-num">4</span> Final Answer</div>
                    <div class="solution-step-content">
                        ${resultBlock}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function showProblemSolution(problem) {
        const solutionHTML = buildProblemSolutionHTML(problem);
        const solutionContentEl = document.getElementById('solutionContent');
        solutionContentEl.innerHTML = solutionHTML;
        renderMathMarkup(solutionContentEl);
        activeReadingId = null;
        openSolutionOverlay();
    }

    function looksLikeCoulombWordProblem(text) {
        const prompt = String(text || '').trim();
        if (!prompt) return false;

        const hasChargeData = /(q\s*\d+|charge|\d\s*(?:c|uc|μc|nc|mc))/i.test(prompt);
        const hasDistance = /(distance|separation|apart|\br\b|\d\s*(?:m|cm|mm))/i.test(prompt);
        const hasForce = /(force|\d\s*(?:n|newton|newtons))/i.test(prompt);
        const asksSolve = /(find|solve|calculate|determine|what is|compute|force|potential\s*energy)/i.test(prompt);

        return hasChargeData && asksSolve && (hasDistance || hasForce);
    }

    async function solveProblemFromInput() {
        const prompt = String(aiPromptInput?.value || '').trim();
        const hasImage = typeof aiPastedImageDataUrl === 'string' && aiPastedImageDataUrl.length > 30;
        if (!prompt && !hasImage) {
            setAIStatus('paste text or image first');
            return;
        }

        setAIChatOpen(true);
        appendChatMessage('user', prompt || '[Problem image]');
        aiPromptInput.value = '';

        if (btnAskAI) btnAskAI.disabled = true;
        if (btnSolveProblem) btnSolveProblem.disabled = true;
        setAIStatus('solving problem');

        let problem = extractWordProblemLocally(prompt);
        if (!problem) {
            setAIStatus('extracting values');
            problem = await inferWordProblemWithAI(prompt, aiPastedImageDataUrl).catch(() => null);
        }

        if (!problem) {
            problem = fallbackExtractSimpleForceProblem(prompt);
        }

        if (problem) {
            problem = solveProblemInputs(problem);
        }

        if (!problem) {
            appendChatMessage('assistant', 'I could not parse complete problem values yet. Include at least two charges and either distance or force (example: q1 = +4 uC, q2 = -2 uC, force = 0.54 N).');
            setAIStatus('need clearer inputs');
            if (btnAskAI) btnAskAI.disabled = false;
            if (btnSolveProblem) btnSolveProblem.disabled = false;
            return;
        }

        const applied = setScenarioFromProblem(problem);
        if (!applied) {
            appendChatMessage('assistant', 'I parsed the problem, but could not apply it to the current simulation canvas.');
            setAIStatus('apply failed');
            if (btnAskAI) btnAskAI.disabled = false;
            if (btnSolveProblem) btnSolveProblem.disabled = false;
            return;
        }

        showProblemSolution(problem);
    const brief = `Applied to simulation. Charges=${problem.chargesC.length}, distance=${problem.distanceM.toFixed(4)} m.`;
        appendChatMessage('assistant', `${brief} Opened the worked solution modal.`);
        setAIStatus('done (applied + solved)');
        clearAIImageAttachment();

        if (btnAskAI) btnAskAI.disabled = false;
        if (btnSolveProblem) btnSolveProblem.disabled = false;
    }

    async function getPhysicsAIAnswer(prompt, imageDataUrl = null) {
        const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                context: buildPhysicsContext(),
                imageDataUrl: imageDataUrl || null,
            }),
        });

        if (!res.ok) {
            throw new Error(`AI request failed: ${res.status}`);
        }

        const data = await res.json();
        return String(data?.answer || '').trim();
    }

    function ensureManualChargeMode() {
        if (!isAtomicMode) return;
        isAtomicMode = false;

        const btn = document.getElementById('btnAtomic');
        if (btn) btn.classList.remove('active');

        chargeSlider.disabled = false;
        chargeInput.disabled = false;
        chargeInput.value = selectedMagnitude;
    }

    function ensureAIActionToast() {
        let toast = document.getElementById('aiActionToast');
        if (toast) return toast;

        toast = document.createElement('div');
        toast.id = 'aiActionToast';
        toast.className = 'ai-action-toast';
        document.body.appendChild(toast);
        return toast;
    }

    function showAIActionToast(message) {
        const toast = ensureAIActionToast();
        toast.textContent = message;
        toast.classList.add('ai-action-toast--show');

        if (aiActionToastTimer) clearTimeout(aiActionToastTimer);
        aiActionToastTimer = setTimeout(() => {
            toast.classList.remove('ai-action-toast--show');
        }, 1800);
    }

    function animateAIChargeFeedback() {
        if (aiFeedbackAnimating) return;
        aiFeedbackAnimating = true;

        const tick = () => {
            if (recentChargeUpdates.size === 0) {
                aiFeedbackAnimating = false;
                return;
            }

            render();
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }

    function triggerChargeUpdateFeedback(updatedIndices) {
        if (!Array.isArray(updatedIndices) || updatedIndices.length === 0) return;

        const expiry = Date.now() + 1400;
        for (const idx of updatedIndices) {
            const target = charges[idx - 1];
            if (target) recentChargeUpdates.set(target.id, expiry);
        }

        showAIActionToast(`Applied: ${updatedIndices.map((i) => `q${i}`).join(', ')}`);
        animateAIChargeFeedback();
    }

    function executeSimulationCommand(command) {
        if (!command) return { handled: false };

        if (command.type === 'summarize-data-log') {
            const targetNum = Number(command.entryNum);
            if (!Number.isFinite(targetNum) || targetNum < 1) {
                return {
                    handled: true,
                    ok: false,
                    message: 'Please specify a valid simulation number from the data log.',
                };
            }

            const entry = dataLog.find((row) => Number(row.num) === targetNum);
            if (!entry) {
                return {
                    handled: true,
                    ok: false,
                    message: `I cannot find Simulation ${targetNum} in the data log. Current entries: ${dataLog.length}.`,
                };
            }

            const relatedEntries = dataLog
                .filter((row) => row.readingId === entry.readingId)
                .sort((a, b) => Number(a.num) - Number(b.num));

            const entriesToExplain = relatedEntries.length > 0 ? relatedEntries : [entry];

            const summaryParts = [
                `Reading summary for ${entry.readingId}:`,
                `Included simulations: ${entriesToExplain.map((row) => `#${row.num} (${row.pair})`).join(', ')}`,
                '',
            ];

            for (const item of entriesToExplain) {
                const potentialJ = potentialEnergy(item.q1, item.q2, item.r);
                const interactionLabel = item.type === 'attract' ? 'Attraction' : 'Repulsion';
                const q1Display = formatSciLatex(item.q1);
                const q2Display = formatSciLatex(item.q2);
                const rDisplay = item.r.toFixed(4);
                const forceDisplay = formatSciLatex(item.f);
                const peDisplay = formatSciLatex(potentialJ);

                summaryParts.push(`Simulation #${item.num} (${item.pair})`);
                summaryParts.push(`Given: $q_1=${q1Display}\\,\\mathrm{C}$, $q_2=${q2Display}\\,\\mathrm{C}$, $r=${rDisplay}\\,\\mathrm{m}$`);
                summaryParts.push('Formula: $$F = k\\frac{|q_1q_2|}{r^2},\\quad U = k\\frac{q_1q_2}{r}$$');
                summaryParts.push(`Substitute: $$F = (8.9875\\times10^9)\\frac{|(${q1Display})(${q2Display})|}{(${rDisplay})^2}$$`);
                summaryParts.push(`Result: $$F = ${forceDisplay}\\,\\mathrm{N},\\quad U = ${peDisplay}\\,\\mathrm{J}$$`);
                summaryParts.push(`Interaction: ${interactionLabel}`);
                summaryParts.push(`Explanation: Opposite signs (+ and -) attract, so the force pulls the charges together.`);
                summaryParts.push(`Explanation: The negative potential energy means the system is bound; you must add energy to separate the charges to infinity.`);
                summaryParts.push('');
            }

            if (entry.readingId) {
                restoreReading(entry.readingId);
            }

            return {
                handled: true,
                ok: true,
                message: summaryParts.join('\n'),
            };
        }

        if (command.type === 'remove-charge-batch') {
            const removeIndices = Array.isArray(command.removeIndices)
                ? Array.from(new Set(command.removeIndices.map((idx) => Number(idx))))
                : [];

            if (removeIndices.length === 0) return { handled: false };

            const invalid = removeIndices.filter((idx) => !Number.isFinite(idx) || idx < 1 || idx > charges.length);
            if (invalid.length > 0) {
                return {
                    handled: true,
                    ok: false,
                    message: `I cannot remove charge ${invalid.join(', ')}. You currently have ${charges.length} charge(s).`,
                };
            }

            const sortedDesc = removeIndices.slice().sort((a, b) => b - a);
            for (const idx of sortedDesc) {
                charges.splice(idx - 1, 1);
            }

            updateFocusPair();
            render();

            return {
                handled: true,
                ok: true,
                message: `Done. Removed ${sortedDesc.map((idx) => `q${idx}`).join(', ')} from the simulation.`,
            };
        }

        if (command.type === 'add-charge') {
            const count = Math.max(1, Math.floor(Number(command.count) || 1));
            const sign = Number(command.sign) === -1 ? -1 : 1;
            const valueMicroC = Number(command.valueMicroC);

            if (Number.isFinite(valueMicroC)) {
                ensureManualChargeMode();
            }

            const newIndices = [];
            for (let i = 0; i < count; i++) {
                addChargeWithOptions({
                    sign,
                    valueMicroC: Number.isFinite(valueMicroC) ? valueMicroC : null,
                });
                newIndices.push(charges.length);
            }

            triggerChargeUpdateFeedback(newIndices);

            const signLabel = sign > 0 ? 'positive' : 'negative';
            const valueLabel = Number.isFinite(valueMicroC)
                ? ` at ${sign > 0 ? '+' : '-'}${valueMicroC} uC`
                : '';

            return {
                handled: true,
                ok: true,
                message: `Done. Added ${count} ${signLabel} charge${count > 1 ? 's' : ''}${valueLabel}.`,
            };
        }

        if (command.type === 'set-charge-batch') {
            const updates = Array.isArray(command.updates) ? command.updates : [];
            if (updates.length === 0) return { handled: false };

            const invalid = updates
                .map((u) => Number(u.chargeIndex))
                .filter((idx) => !Number.isFinite(idx) || idx < 1 || idx > charges.length);

            if (invalid.length > 0) {
                return {
                    handled: true,
                    ok: false,
                    message: `I cannot edit charge ${invalid.join(', ')}. You currently have ${charges.length} charge(s).`,
                };
            }

            ensureManualChargeMode();

            const applied = [];
            const appliedIndices = [];
            for (const upd of updates) {
                const idx = Number(upd.chargeIndex);
                const microValue = Number(upd.valueMicroC);
                if (!Number.isFinite(microValue)) continue;

                const target = charges[idx - 1];
                const absChargeC = Math.abs(microValue) * 1e-6;
                target.charge = absChargeC;

                if (microValue > 0) target.sign = 1;
                if (microValue < 0) target.sign = -1;

                const signPrefix = microValue >= 0 ? '+' : '';
                applied.push(`q${idx}=${signPrefix}${microValue} uC`);
                appliedIndices.push(idx);
            }

            updateFocusPair();
            render();
            triggerChargeUpdateFeedback(appliedIndices);

            return {
                handled: true,
                ok: true,
                message: `Done. Updated ${applied.join(', ')} in the simulation.`,
            };
        }

        if (command.type === 'set-sign-batch') {
            const signUpdates = Array.isArray(command.signUpdates) ? command.signUpdates : [];
            if (signUpdates.length === 0) return { handled: false };

            const invalid = signUpdates
                .map((u) => Number(u.chargeIndex))
                .filter((idx) => !Number.isFinite(idx) || idx < 1 || idx > charges.length);

            if (invalid.length > 0) {
                return {
                    handled: true,
                    ok: false,
                    message: `I cannot edit charge ${invalid.join(', ')}. You currently have ${charges.length} charge(s).`,
                };
            }

            ensureManualChargeMode();
            const applied = [];
            const appliedIndices = [];

            for (const upd of signUpdates) {
                const idx = Number(upd.chargeIndex);
                const sign = Number(upd.sign);
                if (sign !== 1 && sign !== -1) continue;

                charges[idx - 1].sign = sign;
                applied.push(`q${idx}=${sign > 0 ? '+' : '-'} sign`);
                appliedIndices.push(idx);
            }

            updateFocusPair();
            render();
            triggerChargeUpdateFeedback(appliedIndices);

            return {
                handled: true,
                ok: true,
                message: `Done. Updated ${applied.join(', ')} in the simulation.`,
            };
        }

        if (command.type === 'make-different') {
            if (charges.length < 2) {
                return { handled: true, ok: false, message: 'Add at least 2 charges first.' };
            }

            ensureManualChargeMode();
            const c1 = charges[0];
            const c2 = charges[1];
            let changed = false;

            if (c1.sign === c2.sign) {
                c2.sign = -c1.sign;
                changed = true;
            }

            if (Math.abs(c1.charge - c2.charge) < 1e-15) {
                c2.charge = Math.max(c1.charge * 0.8, 1e-6);
                changed = true;
            }

            updateFocusPair();
            render();
            triggerChargeUpdateFeedback([1, 2]);

            return {
                handled: true,
                ok: true,
                message: changed
                    ? 'Done. q1 and q2 are now different in the simulation.'
                    : 'q1 and q2 are already different in the simulation.',
            };
        }

        if (command.type === 'make-equal') {
            if (charges.length < 2) {
                return { handled: true, ok: false, message: 'Add at least 2 charges first.' };
            }

            ensureManualChargeMode();
            const parsed = Number(command.valueMicroC);
            const baseMicro = Number.isFinite(parsed)
                ? Math.abs(parsed)
                : Math.abs((charges[0].sign * charges[0].charge) / 1e-6);

            for (let i = 0; i < charges.length; i++) {
                charges[i].charge = baseMicro * 1e-6;
            }

            updateFocusPair();
            render();
            triggerChargeUpdateFeedback(charges.map((_c, i) => i + 1));

            return {
                handled: true,
                ok: true,
                message: `Done. All charge magnitudes are now ${baseMicro} uC in the simulation.`,
            };
        }

        if (command.type === 'set-opposite-equal') {
            if (charges.length < 2) {
                return { handled: true, ok: false, message: 'Add at least 2 charges first.' };
            }

            ensureManualChargeMode();

            const c1 = charges[0];
            const c2 = charges[1];
            const baseMicro = Math.max(Math.abs((c1.sign * c1.charge) / 1e-6), 0.1);

            c1.sign = 1;
            c2.sign = -1;
            c1.charge = baseMicro * 1e-6;
            c2.charge = baseMicro * 1e-6;

            updateFocusPair();
            render();
            triggerChargeUpdateFeedback([1, 2]);

            return {
                handled: true,
                ok: true,
                message: `Done. q1 is positive and q2 is negative with equal magnitude (${baseMicro} uC).`,
            };
        }

        return { handled: false };
    }

    async function askPhysicsAI() {
        if (!aiResponse || !btnAskAI) return;

        const prompt = getSelectedAIPrompt();
        if (!prompt) {
            setAIStatus('pick a valid action');
            return;
        }

        const quizAnswerText = String(aiPromptInput?.value || '').trim();
        let userMessage = prompt;
        if (prompt === '__EXPLAIN_FOCUS__') userMessage = 'Explain current focused pair';
        if (prompt === '__QUIZ_GENERATE__') userMessage = 'Generate quiz from focused pair';
        if (prompt === '__QUIZ_CHECK__') userMessage = quizAnswerText ? `Quiz answer: ${quizAnswerText}` : 'Check quiz answer';

        setAIChatOpen(true);
        appendChatMessage('user', userMessage);

        btnAskAI.disabled = true;

        setAIStatus('running');

        if (prompt === '__EXPLAIN_FOCUS__') {
            appendChatMessage('assistant', buildFocusPairExplanation());
            setAIStatus('done');
            btnAskAI.disabled = false;
            return;
        }

        if (prompt === '__QUIZ_GENERATE__') {
            const nextQuiz = buildQuizFromFocusPair();
            if (!nextQuiz) {
                appendChatMessage('assistant', 'Cannot generate quiz yet. Add at least two charges and ensure a focus pair is available.');
                setAIStatus('needs setup');
                btnAskAI.disabled = false;
                return;
            }

            quizState = nextQuiz;
            if (aiPresetSelect) {
                aiPresetSelect.value = 'quiz-check';
                updateAIPresetInputs();
            }
            appendChatMessage('assistant', nextQuiz.questionText);
            setAIStatus('quiz ready');
            btnAskAI.disabled = false;
            return;
        }

        if (prompt === '__QUIZ_CHECK__') {
            appendChatMessage('assistant', checkQuizAnswer(quizAnswerText));
            if (aiPromptInput) aiPromptInput.value = '';
            setAIStatus('done');
            btnAskAI.disabled = false;
            return;
        }

        let command = parseSimulationCommand(prompt);

        if (command) {
            const result = executeSimulationCommand(command);
            if (result.handled) {
                appendChatMessage('assistant', result.message);
                setAIStatus(result.ok ? 'done' : 'needs correction');

                clearAIImageAttachment();
                btnAskAI.disabled = false;
                return;
            }
        }

        appendChatMessage('assistant', 'That action is not available in pick mode. Please choose one of the listed options.');
        setAIStatus('pick action');

        clearAIImageAttachment();

        btnAskAI.disabled = false;
    }

    // ═══════════════════ DATA LOG ═══════════════════

    // Save Reading button — logs ALL current charge pairs once + show solution
    function saveReading() {
        if (charges.length < 2) return;

        // Create a unique reading ID and snapshot the current charges
        const readingId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const chargesSnapshot = charges.map(c => ({ ...c })); // deep-clone each charge
        const simulationImageDataUrl = canvas.toDataURL('image/png');

        let solutionHTML = '';
        let pairNum = 0;

        for (let i = 0; i < charges.length; i++) {
            for (let j = i + 1; j < charges.length; j++) {
                const c1 = charges[i];
                const c2 = charges[j];
                const dx = c2.x - c1.x;
                const dy = c2.y - c1.y;
                const dist = Math.hypot(dx, dy);
                const rMeters = pixelsToMeters(dist);
                const force = coulombForce(c1.charge, c2.charge, rMeters);
                const isAttract = c1.sign !== c2.sign;
                const idx1 = charges.indexOf(c1) + 1;
                const idx2 = charges.indexOf(c2) + 1;

                const q1Val = c1.charge * c1.sign;
                const q2Val = c2.charge * c2.sign;
                const pe = potentialEnergy(q1Val, q2Val, rMeters);
                const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
                const angleFinal = ((angle % 360) + 360) % 360;

                const entry = {
                    num: dataLog.length + 1,
                    pair: `q${idx1}↔q${idx2}`,
                    q1: q1Val,
                    q2: q2Val,
                    r: rMeters,
                    f: force,
                    type: isAttract ? 'attract' : 'repel',
                    readingId: readingId,
                };

                dataLog.push(entry);
                if (dataLog.length > MAX_LOG_ROWS) dataLog.shift();

                graphPoints.push({ r: rMeters, f: force, type: entry.type });
                if (graphPoints.length > 200) graphPoints.shift();

                // ── Build solution card for this pair ──
                pairNum++;
                const typeClass = isAttract ? 'solution-pair-type--attract' : 'solution-pair-type--repel';
                const typeLabel = isAttract ? 'Attraction' : 'Repulsion';

                // Format values for display
                const q1Display = formatSciSolution(q1Val);
                const q2Display = formatSciSolution(q2Val);
                const q1Abs = formatSciSolution(Math.abs(q1Val));
                const q2Abs = formatSciSolution(Math.abs(q2Val));
                const q1Latex = formatSciLatex(q1Val);
                const q2Latex = formatSciLatex(q2Val);
                const q1AbsLatex = formatSciLatex(Math.abs(q1Val));
                const q2AbsLatex = formatSciLatex(Math.abs(q2Val));
                const rDisplay = rMeters.toFixed(4);
                const r2Display = (rMeters * rMeters).toExponential(4);
                const productDisplay = formatSciSolution(Math.abs(q1Val) * Math.abs(q2Val));
                const numeratorVal = K * Math.abs(q1Val) * Math.abs(q2Val);
                const numeratorDisplay = formatSciSolution(numeratorVal);
                const forceDisplay = formatSciSolution(force);
                const peDisplay = formatSciSolution(pe);

                solutionHTML += `
                <div class="solution-pair-card">
                    <div class="solution-pair-header">
                        <span class="solution-pair-label">
                            <span class="material-symbols-outlined">bolt</span>
                            Pair ${pairNum}: q${idx1} ↔ q${idx2}
                        </span>
                        <span class="solution-pair-type ${typeClass}">${typeLabel}</span>
                    </div>
                    <div class="solution-pair-body">
                        <!-- Step 1: Given / Identify -->
                        <div class="solution-step">
                            <div class="solution-step-label">
                                <span class="step-num">1</span> Given / Identify
                            </div>
                            <div class="solution-step-content">
                                <span class="formula-highlight">k</span> = 8.9875 × 10<sup>9</sup> N·m²/C²<br>
                                <span class="formula-highlight">q${idx1}</span> = <span class="value-highlight">${q1Display} C</span><br>
                                <span class="formula-highlight">q${idx2}</span> = <span class="value-highlight">${q2Display} C</span><br>
                                <span class="formula-highlight">r</span> = <span class="value-highlight">${rDisplay} m</span>
                            </div>
                        </div>

                        <!-- Step 2: Formula -->
                        <div class="solution-step">
                            <div class="solution-step-label">
                                <span class="step-num">2</span> Formula (Coulomb's Law)
                            </div>
                            <div class="solution-step-content">
                                $$F = k\\frac{|q_1q_2|}{r^2}$$
                            </div>
                        </div>

                        <!-- Step 3: Substitution -->
                        <div class="solution-step">
                            <div class="solution-step-label">
                                <span class="step-num">3</span> Substitution
                            </div>
                            <div class="solution-step-content">
                                $$F = (8.9875 \\times 10^9)\\frac{|${q1AbsLatex}\\times${q2AbsLatex}|}{(${rDisplay})^2}$$
                            </div>
                        </div>

                        <!-- Step 4: Computation -->
                        <div class="solution-step">
                            <div class="solution-step-label">
                                <span class="step-num">4</span> Computation
                            </div>
                            <div class="solution-step-content">
                                |q₁ · q₂| = ${q1Abs} × ${q2Abs} = <span class="value-highlight">${productDisplay} C²</span><br>
                                r² = (${rDisplay})² = <span class="value-highlight">${r2Display} m²</span><br>
                                k · |q₁q₂| = (8.9875 × 10<sup>9</sup>)(${productDisplay}) = <span class="value-highlight">${numeratorDisplay}</span><br>
                                F = ${numeratorDisplay} / ${r2Display}
                            </div>
                        </div>

                        <div class="solution-divider"></div>

                        <!-- Step 5: Result -->
                        <div class="solution-step">
                            <div class="solution-step-label">
                                <span class="step-num">5</span> Result — Electrostatic Force
                            </div>
                            <div class="solution-step-content">
                                <span class="result-highlight">F = ${forceDisplay} N</span><br>
                                Direction: ${angleFinal.toFixed(2)}°<br>
                                Type: <strong>${typeLabel}</strong> — ${isAttract
                                    ? 'opposite signs attract (q₁ and q₂ pull toward each other)'
                                    : 'same signs repel (q₁ and q₂ push apart)'}
                            </div>
                        </div>

                        <div class="solution-divider"></div>

                        <!-- Step 6: Potential Energy -->
                        <div class="solution-step">
                            <div class="solution-step-label">
                                <span class="step-num">6</span> Electrostatic Potential Energy
                            </div>
                            <div class="solution-step-content">
                                $$U = k\\frac{q_1q_2}{r}$$
                                $$U = (8.9875 \\times 10^9)\\frac{(${q1Latex})(${q2Latex})}{${rDisplay}}$$
                                <span class="result-highlight ${pe >= 0 ? 'pe-positive' : 'pe-negative'}">U = ${peDisplay} J</span><br>
                                ${pe >= 0
                                    ? 'Positive U → repulsive system (energy needed to bring charges together)'
                                    : 'Negative U → attractive system (energy released when charges approach)'}
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        }

        // Store the snapshot for this reading
        savedReadings.push({
            id: readingId,
            chargesSnapshot,
            simulationImageDataUrl,
            canvasSnapshot: {
                width: canvas.width,
                height: canvas.height,
            },
            solutionHTML,
        });
        activeReadingId = readingId;

        renderDataLog();
        if (aiSimulationSelect && dataLog.length > 0) {
            aiSimulationSelect.value = String(dataLog[dataLog.length - 1].num);
        }
        drawGraph();

        // Show solution overlay
        const solutionContentEl = document.getElementById('solutionContent');
        solutionContentEl.innerHTML = solutionHTML;
        renderMathMarkup(solutionContentEl);
        openSolutionOverlay();

        // Flash the button for feedback
        const btn = document.getElementById('btnSaveReading');
        btn.classList.remove('flash');
        void btn.offsetWidth; // trigger reflow
        btn.classList.add('flash');
    }

    // Format a number for solution display (scientific notation with HTML sup)
    function formatSciSolution(value) {
        if (value === 0) return '0';
        const abs = Math.abs(value);
        const sign = value < 0 ? '−' : '';
        if (abs >= 0.01 && abs < 1000) return `${sign}${abs.toFixed(4)}`;
        const exp = Math.floor(Math.log10(abs));
        const mantissa = abs / Math.pow(10, exp);
        return `${sign}${mantissa.toFixed(4)} × 10<sup>${exp}</sup>`;
    }

    function formatSciLatex(value) {
        if (!Number.isFinite(value) || value === 0) return '0';

        const abs = Math.abs(value);
        const sign = value < 0 ? '-' : '';
        if (abs >= 0.01 && abs < 1000) return `${sign}${abs.toFixed(4)}`;

        const exp = Math.floor(Math.log10(abs));
        const mantissa = abs / Math.pow(10, exp);
        return `${sign}${mantissa.toFixed(4)}\\times10^{${exp}}`;
    }

    function renderDataLog() {
        let html = '';
        for (let i = dataLog.length - 1; i >= 0; i--) {
            const e = dataLog[i];
            const isLatest = i === dataLog.length - 1;
            const typeClass = e.type === 'attract' ? 'type-badge--attract' : 'type-badge--repel';
            const typeLabel = e.type === 'attract' ? 'Attract' : 'Repel';
            html += `<tr class="data-log-row ${isLatest ? 'active-row' : ''}" onclick="window.__restoreReading('${e.readingId}')" title="Click to restore this reading">
                <td class="col-num">${String(e.num).padStart(3, '0')}</td>
                <td class="col-pair">${e.pair}</td>
                <td>${formatSciShort(e.q1)}</td>
                <td>${formatSciShort(e.q2)}</td>
                <td>${e.r.toFixed(3)}</td>
                <td class="col-f">${formatSciShort(e.f)}</td>
                <td class="col-type"><span class="type-badge ${typeClass}">${typeLabel}</span></td>
            </tr>`;
        }
        dataLogBody.innerHTML = html;
        entryCount.textContent = `${dataLog.length} Entries`;
        refreshAISimulationOptions();
    }

    // Restore simulation to a saved reading's state and show its solution
    function restoreReading(readingId) {
        const snapshot = savedReadings.find(s => s.id === readingId);
        if (!snapshot) return;

        // Restore charge positions from the snapshot
        charges = snapshot.chargesSnapshot.map(c => ({ ...c }));
        updateFocusPair();
        render();

        // Show the saved solution
        const solutionContentEl = document.getElementById('solutionContent');
        solutionContentEl.innerHTML = snapshot.solutionHTML;
        renderMathMarkup(solutionContentEl);
        activeReadingId = readingId;
        openSolutionOverlay();
    }

    // Expose restore function globally for inline onclick
    window.__restoreReading = restoreReading;

    function clearLog() {
        dataLog = [];
        graphPoints = [];
        savedReadings = [];
        dataLogBody.innerHTML = '';
        entryCount.textContent = '0 Entries';
        refreshAISimulationOptions();
        drawGraph();
    }

    function exportCSV() {
        if (dataLog.length === 0) return;
        let csv = '#,Pair,q1 (C),q2 (C),r (m),F (N),Type\n';
        for (const e of dataLog) {
            csv += `${e.num},${e.pair},${e.q1.toExponential(3)},${e.q2.toExponential(3)},${e.r.toFixed(4)},${e.f.toExponential(4)},${e.type}\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'coulombic_data_log.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ═══════════════════ GRAPH ═══════════════════

    function drawGraph() {
        const w = graphCanvasEl.width;
        const h = graphCanvasEl.height;
        const isDark = document.documentElement.dataset.theme !== 'light';

        graphCtx.clearRect(0, 0, w, h);

        // Margins
        const ml = 40, mr = 16, mt = 8, mb = 28;
        const pw = w - ml - mr;
        const ph = h - mt - mb;

        // Background
        graphCtx.fillStyle = isDark ? '#0F1219' : '#ffffff';
        graphCtx.fillRect(0, 0, w, h);

        // Determine axis ranges
        let rMin = 0.02, rMax = 0.6, fMax = 0.5;
        if (graphPoints.length > 0) {
            rMax = Math.max(0.3, ...graphPoints.map(p => p.r)) * 1.2;
            fMax = Math.max(0.1, ...graphPoints.map(p => p.f)) * 1.3;
        }

        // Grid lines
        graphCtx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        graphCtx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = mt + (ph * i / 4);
            graphCtx.beginPath();
            graphCtx.moveTo(ml, y);
            graphCtx.lineTo(ml + pw, y);
            graphCtx.stroke();

            const x = ml + (pw * i / 4);
            graphCtx.beginPath();
            graphCtx.moveTo(x, mt);
            graphCtx.lineTo(x, mt + ph);
            graphCtx.stroke();
        }

        // Axes
        graphCtx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
        graphCtx.lineWidth = 1;
        graphCtx.beginPath();
        graphCtx.moveTo(ml, mt);
        graphCtx.lineTo(ml, mt + ph);
        graphCtx.lineTo(ml + pw, mt + ph);
        graphCtx.stroke();

        // Axis labels
        graphCtx.font = '500 10px "Geist Mono"';
        graphCtx.fillStyle = isDark ? '#475569' : '#94a3b8';
        graphCtx.textAlign = 'center';
        graphCtx.fillText('r (m)', ml + pw / 2, h - 2);

        graphCtx.save();
        graphCtx.translate(10, mt + ph / 2);
        graphCtx.rotate(-Math.PI / 2);
        graphCtx.fillText('F (N)', 0, 0);
        graphCtx.restore();

        // Tick labels
        graphCtx.font = '400 9px "Geist Mono"';
        graphCtx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const y = mt + ph - (ph * i / 4);
            const val = fMax * i / 4;
            graphCtx.fillText(val < 0.01 ? val.toExponential(0) : val.toFixed(2), ml - 4, y + 3);
        }
        graphCtx.textAlign = 'center';
        for (let i = 0; i <= 4; i++) {
            const x = ml + (pw * i / 4);
            const val = rMin + (rMax - rMin) * i / 4;
            graphCtx.fillText(val.toFixed(2), x, mt + ph + 14);
        }

        // Theoretical 1/r² curve (using focus pair charges)
        if (focusPair[0] && focusPair[1]) {
            const q1 = Math.abs(focusPair[0].charge);
            const q2 = Math.abs(focusPair[1].charge);
            graphCtx.setLineDash([5, 4]);
            graphCtx.strokeStyle = isDark ? 'rgba(245, 158, 11, 0.6)' : 'rgba(217, 119, 6, 0.6)';
            graphCtx.lineWidth = 1.5;
            graphCtx.beginPath();
            let first = true;
            for (let px = 0; px <= pw; px += 2) {
                const r = rMin + (rMax - rMin) * (px / pw);
                if (r <= 0.005) continue;
                const f = K * q1 * q2 / (r * r);
                const py = ph - (f / fMax) * ph;
                if (py < -20) continue;
                if (first) { graphCtx.moveTo(ml + px, mt + py); first = false; }
                else graphCtx.lineTo(ml + px, mt + py);
            }
            graphCtx.stroke();
            graphCtx.setLineDash([]);
        }

        // Data points (color-coded by type)
        for (const pt of graphPoints) {
            const px = ml + ((pt.r - rMin) / (rMax - rMin)) * pw;
            const py = mt + ph - (pt.f / fMax) * ph;
            if (px < ml || px > ml + pw || py < mt - 5) continue;

            const isAttract = pt.type === 'attract';
            graphCtx.shadowColor = isAttract
                ? (isDark ? 'rgba(59,130,246,0.5)' : 'rgba(37,99,235,0.4)')
                : (isDark ? 'rgba(239,68,68,0.5)' : 'rgba(220,38,38,0.4)');
            graphCtx.shadowBlur = 6;
            graphCtx.beginPath();
            graphCtx.arc(px, py, 3, 0, Math.PI * 2);
            graphCtx.fillStyle = isAttract
                ? (isDark ? '#60A5FA' : '#2563EB')
                : (isDark ? '#F87171' : '#DC2626');
            graphCtx.fill();
            graphCtx.shadowBlur = 0;
        }
    }

    // ═══════════════════ THEME TOGGLE ═══════════════════

    function toggleTheme() {
        const html = document.documentElement;
        const isDark = html.dataset.theme !== 'light';
        html.dataset.theme = isDark ? 'light' : 'dark';

        const icon = document.querySelector('.theme-icon');
        icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => { icon.style.transform = ''; }, 400);

        // Re-render with new theme
        setTimeout(() => render(), 50);
    }

    // Detect system preference on load
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.dataset.theme = 'light';
        const icon = document.querySelector('.theme-icon');
        if (icon) icon.textContent = 'light_mode';
    }

    // ═══════════════════ UTILITIES ═══════════════════

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function formatSci(value, unit) {
        if (Math.abs(value) === 0) return `0 ${unit}`;
        const exp = Math.floor(Math.log10(Math.abs(value)));
        const mantissa = value / Math.pow(10, exp);
        if (exp === 0) return `${value.toFixed(3)} ${unit}`;
        return `${mantissa.toFixed(3)} × 10${superscriptNum(exp)} ${unit}`;
    }

    function formatSciPdf(value, unit = '') {
        if (!Number.isFinite(value)) return unit ? `0 ${unit}` : '0';
        if (value === 0) return unit ? `0 ${unit}` : '0';

        const abs = Math.abs(value);
        const sign = value < 0 ? '-' : '';
        let body;

        if (abs >= 0.01 && abs < 1000) {
            body = `${sign}${abs.toFixed(4)}`;
        } else {
            const exp = Math.floor(Math.log10(abs));
            const mantissa = abs / Math.pow(10, exp);
            body = `${sign}${mantissa.toFixed(4)} x 10^${exp}`;
        }

        return unit ? `${body} ${unit}` : body;
    }

    function formatSciHTML(value) {
        if (value === 0) return '0';
        const abs = Math.abs(value);
        const exp = Math.floor(Math.log10(abs));
        const mantissa = abs / Math.pow(10, exp);
        const sSign = value < 0 ? '−' : '+';
        return `${sSign}${mantissa.toFixed(2)} × 10<sup>${exp}</sup>`;
    }

    function formatSciShort(value) {
        if (value === 0) return '0';
        const sign = value >= 0 ? '+' : '−';
        const abs = Math.abs(value);
        if (abs >= 0.01 && abs < 1000) return `${sign}${abs.toFixed(3)}`;
        const exp = Math.floor(Math.log10(abs));
        const mantissa = abs / Math.pow(10, exp);
        return `${sign}${mantissa.toFixed(2)}×10${superscriptNum(exp)}`;
    }

    // Convert a number to Unicode superscript characters
    function superscriptNum(n) {
        const superDigits = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
        const str = Math.abs(n).toString();
        let result = n < 0 ? '⁻' : '';
        for (const ch of str) result += superDigits[ch] || ch;
        return result;
    }

    // ═══════════════════ START ═══════════════════
    window.addEventListener('DOMContentLoaded', init);
})();
