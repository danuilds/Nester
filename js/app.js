/**
 * Main Application Controller
 */
class NesterApp {
    constructor() {
        this.nester = null;
        this.solution = null;
        this.visualization = null;
        this.currentSheetIndex = 0;
        this.shapes = [];
        this.progressTimer = null;
        this.progressStartTs = 0;
        this.progressEstimatedMs = 0;
        this.progressSolverPercent = 2;
        this.progressSolverAttempts = 0;
        this.progressSolverPlaced = 0;
        this.lastPreviewRenderTs = 0;
        this.progressEtaSeconds = null;
        this.progressHistory = [];
        this.defaultsStorageKey = 'nester.default-settings.v1';
        this.currentDxfFileName = '';
        this.init();
    }

    init() {
        this.setupElements();
        this.applySettings(this.getActiveDefaults());
        this.attachEventListeners();
        this.visualization = new Visualization(document.getElementById('nestingCanvas'));
        this.visualization.drawEmpty();
        this.updateConstraintStatus();
    }

    setupElements() {
        this.elements = {
            paperWidth: document.getElementById('paperWidth'),
            paperHeight: document.getElementById('paperHeight'),
            marginTop: document.getElementById('marginTop'),
            marginLeft: document.getElementById('marginLeft'),
            padding: document.getElementById('padding'),
            dxfUpload: document.getElementById('dxfUpload'),
            orientations: document.getElementById('orientations'),
            sheetsLimit: document.getElementById('sheetsLimit'),
            randomSeed: document.getElementById('randomSeed'),
            exportDimensions: document.getElementById('exportDimensions'),
            drawingNo: document.getElementById('drawingNo'),
            sheetLabelTemplate: document.getElementById('sheetLabelTemplate'),

            runOptimization: document.getElementById('runOptimization'),
            resetForm: document.getElementById('resetForm'),
            exportResults: document.getElementById('exportResults'),
            exportCsv: document.getElementById('exportCsv'),
            exportJson: document.getElementById('exportJson'),
            exportSvg: document.getElementById('exportSvg'),
            saveDefaults: document.getElementById('saveDefaults'),
            loadDefaults: document.getElementById('loadDefaults'),
            resetDefaults: document.getElementById('resetDefaults'),

            geometryInfo: document.getElementById('geometryInfo'),
            constraintsInfo: document.getElementById('constraintsInfo'),
            resultsInfo: document.getElementById('resultsInfo'),
            canvasInfo: document.getElementById('canvasInfo'),
            statisticsTable: document.getElementById('statisticsTable'),
            nestingCanvas: document.getElementById('nestingCanvas')
        };
    }

    attachEventListeners() {
        this.elements.dxfUpload.addEventListener('change', e => this.handleDXFUpload(e));
        this.elements.runOptimization.addEventListener('click', () => this.runOptimization());
        this.elements.resetForm.addEventListener('click', () => this.resetForm());
        this.elements.exportResults.addEventListener('click', () => this.exportResults());
        this.elements.exportCsv.addEventListener('click', () => this.exportCsv());
        this.elements.exportJson.addEventListener('click', () => this.exportJson());
        this.elements.exportSvg.addEventListener('click', () => this.exportSvg());
        this.elements.saveDefaults.addEventListener('click', () => this.saveCurrentAsDefaults());
        this.elements.loadDefaults.addEventListener('click', () => this.loadDefaultsToForm());
        this.elements.resetDefaults.addEventListener('click', () => this.resetStoredDefaults());

        const liveConstraintInputs = [
            this.elements.paperWidth,
            this.elements.paperHeight,
            this.elements.marginTop,
            this.elements.marginLeft,
            this.elements.padding,
            this.elements.orientations,
            this.elements.sheetsLimit,
            this.elements.randomSeed,
            this.elements.sheetLabelTemplate,
            this.elements.drawingNo
        ];
        liveConstraintInputs.forEach(el => {
            el.addEventListener('input', () => this.updateConstraintStatus());
            el.addEventListener('change', () => this.updateConstraintStatus());
        });

        const relabelInputs = [this.elements.sheetLabelTemplate, this.elements.drawingNo];
        relabelInputs.forEach(el => {
            el.addEventListener('input', () => {
                if (this.solution && this.solution.sheets && this.solution.sheets.length > 0) {
                    this.showSheet(this.currentSheetIndex);
                }
            });
        });

        window.addEventListener('resize', () => {
            if (this.visualization && this.solution) {
                this.visualization.setDimensions(
                    parseInt(this.elements.paperWidth.value, 10),
                    parseInt(this.elements.paperHeight.value, 10)
                );
                this.showSheet(this.currentSheetIndex);
            }
        });
    }

    handleDXFUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        this.currentDxfFileName = file.name || '';

        const reader = new FileReader();

        reader.onload = e => {
            try {
                const dxfText = e.target.result;

                if (!dxfText || dxfText.trim().length === 0) {
                    this.showError('Uploaded file is empty.');
                    return;
                }

                this.shapes = DXFParser.parse(dxfText);

                if (!Array.isArray(this.shapes) || this.shapes.length === 0) {
                    this.showError('No usable shapes found in this DXF file.');
                    this.elements.geometryInfo.innerHTML = '<strong>File loaded</strong><br>No valid shapes parsed';
                    this.updateConstraintStatus();
                    return;
                }

                this.updateGeometryInfo();
                if (!this.elements.drawingNo.value.trim()) {
                    this.elements.drawingNo.value = this.deriveDrawingNoFromFilename(this.currentDxfFileName);
                }
                this.resetResults();
                this.updateConstraintStatus();
                this.showSuccess(`DXF loaded: ${this.shapes.length} shape(s).`);
            } catch (error) {
                this.showError(`DXF parsing failed: ${error.message}`);
                this.updateConstraintStatus();
            }
        };

        reader.onerror = () => {
            this.showError('Error while reading the DXF file.');
        };

        reader.readAsText(file);
    }

    updateGeometryInfo() {
        if (!this.shapes || this.shapes.length === 0) {
            this.elements.geometryInfo.innerHTML = 'No shapes loaded.';
            return;
        }

        let info = `<strong>Loaded Shapes: ${this.shapes.length}</strong><br>`;
        let totalArea = 0;

        this.shapes.forEach((shape, index) => {
            const area = Geometry.calculateArea(shape);
            totalArea += area;
            const type = shape.type.charAt(0).toUpperCase() + shape.type.slice(1);
            info += `${index + 1}. ${type} (Area: ${area.toFixed(2)} mm²)<br>`;
        });

        info += `<br><strong>Total Area: ${totalArea.toFixed(2)} mm²</strong>`;
        this.elements.geometryInfo.innerHTML = info;
    }

    getLargestShapeBounds() {
        if (!this.shapes || this.shapes.length === 0) return null;
        let largest = null;
        let largestArea = -1;
        for (const shape of this.shapes) {
            const area = Geometry.calculateArea(shape);
            if (area > largestArea) {
                largestArea = area;
                largest = shape;
            }
        }
        return largest ? Geometry.getShapeBounds(largest) : null;
    }

    collectConstraintDiagnostics() {
        const hard = [];
        const soft = [];

        const paperW = parseInt(this.elements.paperWidth.value, 10) || 0;
        const paperH = parseInt(this.elements.paperHeight.value, 10) || 0;
        const marginTop = parseInt(this.elements.marginTop.value, 10) || 0;
        const marginLeft = parseInt(this.elements.marginLeft.value, 10) || 0;
        const spacing = parseInt(this.elements.padding.value, 10) || 0;
        const orientations = parseInt(this.elements.orientations.value, 10) || 0;
        const sheetsLimit = parseInt(this.elements.sheetsLimit.value, 10) || 0;
        const randomSeed = parseInt(this.elements.randomSeed.value, 10) || 0;
        const template = (this.elements.sheetLabelTemplate.value || '').trim();

        if (paperW <= 0 || paperH <= 0) {
            hard.push('Paper size must be greater than 0.');
        }
        if (paperW - marginLeft * 2 <= 0 || paperH - marginTop * 2 <= 0) {
            hard.push('Margins consume full sheet area.');
        }
        if (spacing < 0) {
            hard.push('Segment spacing must not be negative.');
        }
        if (orientations < 1 || orientations > 360) {
            hard.push('Distinct orientations must be between 1 and 360.');
        }
        if (sheetsLimit < 1) {
            hard.push('Max sheets must be at least 1.');
        }
        if (randomSeed < 1) {
            hard.push('Random seed must be a positive integer.');
        }
        if (!this.shapes || this.shapes.length === 0) {
            hard.push('No DXF geometry loaded.');
        }

        const largestBounds = this.getLargestShapeBounds();
        if (largestBounds) {
            const usableW = paperW - marginLeft * 2;
            const usableH = paperH - marginTop * 2;
            if (largestBounds.width > usableW || largestBounds.height > usableH) {
                hard.push('Largest segment does not fit inside usable sheet area.');
            }
        }

        const allowedPlaceholders = new Set(['drawingNo', 'sheetNumber', 'totalSheets', 'segments', 'utilization', 'angles']);
        const found = [...template.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
        const unknown = [...new Set(found.filter(token => !allowedPlaceholders.has(token)))];
        if (unknown.length > 0) {
            soft.push(`Unknown placeholders in label: ${unknown.join(', ')}`);
        }
        if (!template) {
            soft.push('Sheet label template is empty. Fallback label will be used.');
        }

        return { hard, soft };
    }

    updateConstraintStatus() {
        const diag = this.collectConstraintDiagnostics();
        const isHardFail = diag.hard.length > 0;

        const hardHtml = diag.hard.map(item => `• ${item}`).join('<br>');
        const softHtml = diag.soft.map(item => `• ${item}`).join('<br>');

        let html = '';
        if (!isHardFail && diag.soft.length === 0) {
            html = '<strong>All constraints look valid.</strong>';
        } else {
            if (diag.hard.length > 0) {
                html += `<strong>Blocking:</strong><br>${hardHtml}`;
            }
            if (diag.soft.length > 0) {
                if (html) html += '<br><br>';
                html += `<strong>Warnings:</strong><br>${softHtml}`;
            }
        }

        this.elements.constraintsInfo.className = `info-box ${isHardFail ? 'error' : (diag.soft.length > 0 ? '' : 'success')}`;
        this.elements.constraintsInfo.innerHTML = html;
        this.elements.runOptimization.disabled = isHardFail;
    }

    deriveDrawingNoFromFilename(filename) {
        if (!filename) return '';
        return filename.replace(/\.[^.]+$/, '').trim();
    }

    getSheetUtilizationFromPlacements(placements) {
        const usedArea = (placements || []).reduce((sum, placement) => {
            return sum + Geometry.calculateArea(placement.shape);
        }, 0);
        const totalArea = parseInt(this.elements.paperWidth.value, 10) * parseInt(this.elements.paperHeight.value, 10);
        if (totalArea <= 0) return '0.0';
        return ((usedArea / totalArea) * 100).toFixed(1);
    }

    getSheetAnglesCount(placements) {
        const keys = new Set((placements || [])
            .filter(p => typeof p.angle === 'number')
            .map(p => (((p.angle % 360) + 360) % 360).toFixed(1)));
        return keys.size;
    }

    formatSheetLabel(data) {
        const template = (this.elements.sheetLabelTemplate.value || '').trim();
        const fallback = '{drawingNo} | Segments {segments} | Utilization {utilization}%';
        const resolvedTemplate = template || fallback;

        return resolvedTemplate.replace(/\{(\w+)\}/g, (_, token) => {
            if (Object.prototype.hasOwnProperty.call(data, token)) {
                return String(data[token]);
            }
            return '';
        }).replace(/\s+\|\s+\|\s+/g, ' | ').trim();
    }

    buildSheetLabel({ sheetNumber, totalSheets, segments, utilization, angles }) {
        const drawingNo = (this.elements.drawingNo.value || '').trim()
            || this.deriveDrawingNoFromFilename(this.currentDxfFileName);

        return this.formatSheetLabel({
            drawingNo,
            sheetNumber,
            totalSheets,
            segments,
            utilization,
            angles
        });
    }

    runOptimization() {
        const diagnostics = this.collectConstraintDiagnostics();
        if (diagnostics.hard.length > 0) {
            this.updateConstraintStatus();
            this.showError('Fix blocking constraints before running optimization.');
            return;
        }

        if (this.shapes.length === 0) {
            this.showError('Load a DXF file first.');
            return;
        }

        const estimatedMs = this.estimateOptimizationMs();
        this.visualization.setDimensions(
            parseInt(this.elements.paperWidth.value, 10),
            parseInt(this.elements.paperHeight.value, 10)
        );
        this.setLoading(true, estimatedMs);
        const runStarted = performance.now();
        const minVisibleMs = 800;

        setTimeout(async () => {
            let runError = null;

            try {
                this.nester = new Nester({
                    paperWidth: parseInt(this.elements.paperWidth.value, 10),
                    paperHeight: parseInt(this.elements.paperHeight.value, 10),
                    marginTop: parseInt(this.elements.marginTop.value, 10),
                    marginLeft: parseInt(this.elements.marginLeft.value, 10),
                    padding: parseInt(this.elements.padding.value, 10),
                    maxSheets: parseInt(this.elements.sheetsLimit.value, 10),
                    numOrientations: parseInt(this.elements.orientations.value, 10),
                    randomSeed: parseInt(this.elements.randomSeed.value, 10)
                });

                this.nester.setShapes(this.shapes);
                this.solution = await this.nester.solveAsync((meta) => {
                    this.updateProgressFromSolver(meta);
                });
            } catch (error) {
                runError = error;
            }

            const elapsed = performance.now() - runStarted;
            const remainingForVisibility = Math.max(0, minVisibleMs - elapsed);

            setTimeout(() => {
                if (runError) {
                    this.showError(`Optimization failed: ${runError.message}`);
                } else {
                    this.displayResults();
                }
                this.setLoading(false);
            }, remainingForVisibility);
        }, 30);
    }

    estimateOptimizationMs() {
        const shapes = Math.max(1, this.shapes.length);
        const orientations = Math.max(1, parseInt(this.elements.orientations.value, 10) || 1);
        const sheets = Math.max(1, parseInt(this.elements.sheetsLimit.value, 10) || 1);

        const complexityScore = shapes * orientations * sheets;
        return Math.min(30000, Math.max(1200, 600 + complexityScore * 14));
    }

    startProgress(estimatedMs) {
        this.stopProgress();
        this.progressEstimatedMs = estimatedMs;
        this.progressStartTs = performance.now();
        this.progressSolverPercent = 2;
        this.progressSolverAttempts = 0;
        this.progressSolverPlaced = 0;
        this.progressEtaSeconds = null;
        this.progressHistory = [];

        const tick = () => {
            const elapsed = performance.now() - this.progressStartTs;
            const minimalTimeFloor = Math.min(12, 2 + Math.log1p(elapsed / 1000) * 3);
            const percent = Math.max(2, Math.min(95, Math.round(Math.max(this.progressSolverPercent, minimalTimeFloor))));
            this.renderProgress(percent);
        };

        tick();
        this.progressTimer = setInterval(tick, 140);
    }

    stopProgress() {
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
    }

    renderProgress(percent) {
        const etaLabel = this.progressEtaSeconds === null
            ? 'Calibrating...'
            : `~${this.progressEtaSeconds}s`;

        this.elements.resultsInfo.innerHTML = `
            <div class="info-box">
                <strong>Optimization running...</strong>
                <div class="progress-meta">Progress: ${percent}%</div>
                <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
                    <div class="progress-fill" style="width: ${percent}%;"></div>
                </div>
                <div class="progress-meta">ETA (adaptive): ${etaLabel}</div>
                <div class="progress-meta">Placed: ${this.progressSolverPlaced}</div>
            </div>
        `;
    }

    updateProgressFromSolver(meta) {
        if (!meta) return;

        this.progressSolverPlaced = meta.placedCount ?? this.progressSolverPlaced;
        this.progressSolverAttempts = meta.attempts ?? this.progressSolverAttempts;

        const attempts = Math.max(1, this.progressSolverAttempts);
        const placed = Math.max(0, this.progressSolverPlaced);
        const productivity = placed / attempts;

        // Smooth nonlinear progress from actual work; capped until completion.
        const workCurve = 1 - Math.exp(-(placed + attempts * 0.15) / 40);
        const qualityFactor = Math.min(1, 0.45 + productivity);
        this.progressSolverPercent = Math.min(94, Math.round(workCurve * qualityFactor * 100));
        this.updateAdaptiveEta();

        if (meta.preview) {
            this.renderLivePreview(meta);
        }
    }

    updateAdaptiveEta() {
        const now = performance.now();
        const currentPercent = this.progressSolverPercent;

        this.progressHistory.push({ t: now, p: currentPercent });
        const historyWindowMs = 5000;
        this.progressHistory = this.progressHistory.filter(item => now - item.t <= historyWindowMs);

        if (this.progressHistory.length < 4) {
            this.progressEtaSeconds = null;
            return;
        }

        const first = this.progressHistory[0];
        const last = this.progressHistory[this.progressHistory.length - 1];
        const dtSec = Math.max(0.001, (last.t - first.t) / 1000);
        const dp = last.p - first.p;
        const speed = dp / dtSec; // percent points per second

        if (speed <= 0.05 || currentPercent < 5) {
            this.progressEtaSeconds = null;
            return;
        }

        const remaining = Math.max(0, 100 - currentPercent);
        const rawEta = remaining / speed;
        this.progressEtaSeconds = Math.min(3600, Math.max(1, Math.round(rawEta)));
    }

    renderLivePreview(meta) {
        const now = performance.now();
        if (now - this.lastPreviewRenderTs < 45) {
            return;
        }
        this.lastPreviewRenderTs = now;

        const preview = meta.preview;
        if (!preview) return;

        const sheetNum = (meta.sheetIndex || 0) + 1;
        const placements = preview.placements || [];
        const sheetLabel = this.buildSheetLabel({
            sheetNumber: sheetNum,
            totalSheets: this.solution?.sheets?.length || this.elements.sheetsLimit.value || '...',
            segments: placements.length,
            utilization: this.getSheetUtilizationFromPlacements(placements),
            angles: this.getSheetAnglesCount(placements)
        });
        this.visualization.drawWorkingPreview(
            placements,
            preview.candidate || null,
            preview.status || 'trying',
            sheetNum,
            sheetLabel
        );
    }

    displayResults() {
        if (!this.solution || !this.solution.sheets || this.solution.sheets.length === 0) {
            this.showError('No valid placement was found with the current settings.');
            return;
        }

        this.currentSheetIndex = 0;
        const stats = this.nester.getStatistics(this.solution);
        const decisionText = stats.recommendedMode === 'optimized'
            ? 'Optimized layout selected: higher net production score than baseline.'
            : (stats.recommendedMode === 'tie'
                ? 'Tie: optimized and baseline are practically equivalent with current scoring.'
                : 'Optimized layout shown; baseline is still cheaper/simpler with current scoring.');
        const sanityText = stats.sanity && stats.sanity.valid
            ? 'Sanity checks passed.'
            : `Sanity issues: ${stats.sanity?.issues?.join('; ') || 'unknown'}`;

        this.elements.resultsInfo.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.avgUtilization}%</div>
                    <div class="stat-label">Utilization</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.unusedPercent}%</div>
                    <div class="stat-label">Unused Area</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.unusedArea}</div>
                    <div class="stat-label">Unused mm²</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.sanity.valid ? 'OK' : 'FAIL'}</div>
                    <div class="stat-label">Spacing/Edge Rules</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.seed ?? '-'}</div>
                    <div class="stat-label">Seed</div>
                </div>
            </div>
            <div class="info-box">
                Baseline (0°, row/column): ${stats.baselineUtilization}% utilization, ${stats.baselineUnusedPercent}% unused
                <br>Optimized delta: ${stats.utilizationGainPoints >= 0 ? '+' : ''}${stats.utilizationGainPoints} pp utilization, ${(Number(stats.baselineUnusedPercent) - Number(stats.unusedPercent)).toFixed(1)} pp less unused area
            </div>
            <div class="info-box">
                <strong>Decision:</strong> ${decisionText}
                <br><strong>Quality:</strong> ${sanityText}
                <br><strong>Min Segment Gap:</strong> ${(stats.sanity?.clearance?.minSegmentGap ?? 0).toFixed(2)} mm (required ${parseFloat(this.elements.padding.value || '0').toFixed(2)} mm)
                <br><strong>Min Edge Gap X/Y:</strong> ${(stats.sanity?.clearance?.minEdgeGapX ?? 0).toFixed(2)} / ${(stats.sanity?.clearance?.minEdgeGapY ?? 0).toFixed(2)} mm
            </div>
            <table class="results-table compare-table">
                <thead>
                    <tr><th>Metric</th><th>Baseline</th><th>Optimized</th><th>Delta</th></tr>
                </thead>
                <tbody>
                    <tr><td>Utilization</td><td>${stats.baselineUtilization}%</td><td>${stats.avgUtilization}%</td><td>${stats.utilizationGainPoints >= 0 ? '+' : ''}${stats.utilizationGainPoints} pp</td></tr>
                    <tr><td>Unused Area</td><td>${stats.baselineUnusedPercent}%</td><td>${stats.unusedPercent}%</td><td>${(Number(stats.unusedPercent) - Number(stats.baselineUnusedPercent)).toFixed(1)} pp</td></tr>
                    <tr><td>Placed Segments</td><td>${stats.baselineSegments}</td><td>${stats.totalSegments}</td><td>${stats.segmentGain >= 0 ? '+' : ''}${stats.segmentGain}</td></tr>
                    <tr><td>Min Segment Gap</td><td>-</td><td>${(stats.sanity?.clearance?.minSegmentGap ?? 0).toFixed(2)} mm</td><td>-</td></tr>
                </tbody>
            </table>
            <div class="info-box">
                Angles in use: ${stats.usedOrientations.length > 0 ? stats.usedOrientations.map(v => `${v.toFixed(1)}°`).join(', ') : 'none'}
            </div>
            ${stats.testedVariants && stats.testedVariants.length > 0 ? `
            <div class="info-box">
                Tested distinct-variants: ${stats.testedVariants.map(v => `${v.orientationLimit}${v.phase ? ` (${v.phase})` : ''}`).join(', ')}
            </div>` : ''}
        `;

        let tableHTML = '<table class="results-table"><thead><tr><th>Baseline Segments</th><th>Optimized Segments</th><th>Baseline Util.</th><th>Optimized Util.</th></tr></thead><tbody>';
        stats.sheetData.forEach(sheet => {
            const baselineSheet = (stats.baselineSheetData || []).find(b => b.sheetNumber === sheet.sheetNumber) || { segments: 0, utilizationPercent: '0.0' };
            tableHTML += `<tr><td>${baselineSheet.segments}</td><td>${sheet.segments}</td><td>${baselineSheet.utilizationPercent}%</td><td>${sheet.utilizationPercent}%</td></tr>`;
        });
        tableHTML += '</tbody></table>';

        this.elements.statisticsTable.innerHTML = tableHTML;
        this.elements.exportResults.disabled = false;
        this.elements.exportCsv.disabled = false;
        this.elements.exportJson.disabled = false;
        this.elements.exportSvg.disabled = false;
        this.showSheet(0);
    }

    showSheet(index) {
        if (!this.solution || !this.solution.sheets) return;

        if (index < 0) index = 0;
        if (index >= this.solution.sheets.length) index = this.solution.sheets.length - 1;

        this.currentSheetIndex = index;

        this.visualization.setDimensions(
            parseInt(this.elements.paperWidth.value, 10),
            parseInt(this.elements.paperHeight.value, 10)
        );

        const sheet = this.solution.sheets[index];
        const sheetLabel = this.buildSheetLabel({
            sheetNumber: index + 1,
            totalSheets: this.solution.sheets.length,
            segments: sheet.length,
            utilization: this.getSheetUtilizationFromPlacements(sheet),
            angles: this.getSheetAnglesCount(sheet)
        });
        this.visualization.drawSheet(sheet, index + 1, this.solution.sheets.length, sheetLabel);
    }

    exportResults() {
        if (!this.solution || !this.nester) {
            this.showError('No results to export.');
            return;
        }

        const stats = this.nester.getStatistics(this.solution);
        const paperWidth = parseInt(this.elements.paperWidth.value, 10);
        const paperHeight = parseInt(this.elements.paperHeight.value, 10);
        const includeDimensions = Boolean(this.elements.exportDimensions.checked);
        const pdfBytes = this.buildVectorPdf(this.solution, stats, paperWidth, paperHeight, includeDimensions);
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sheet_utilization_vector.pdf';
        link.click();
        URL.revokeObjectURL(url);

        this.showSuccess('Vector PDF exported.');
    }

    getPlacementRows(includeDimensions = true) {
        if (!this.solution || !this.solution.sheets) return [];
        const rows = [];
        for (let s = 0; s < this.solution.sheets.length; s++) {
            const sheet = this.solution.sheets[s];
            const ordered = [...sheet].sort((a, b) => (a.y - b.y) || (a.x - b.x));
            for (let i = 0; i < ordered.length; i++) {
                const placement = ordered[i];
                const row = {
                    sheet: s + 1,
                    order: i + 1,
                    templateId: placement.templateId,
                    angle: Number((placement.angle || 0).toFixed(3)),
                    x: Number((placement.x || 0).toFixed(3)),
                    y: Number((placement.y || 0).toFixed(3)),
                    shapeType: placement.shape?.type || 'unknown'
                };
                if (includeDimensions) {
                    const b = Geometry.getShapeBounds(Geometry.translateShape(placement.shape, placement.x, placement.y));
                    row.minX = Number(b.minX.toFixed(3));
                    row.minY = Number(b.minY.toFixed(3));
                    row.maxX = Number(b.maxX.toFixed(3));
                    row.maxY = Number(b.maxY.toFixed(3));
                    row.width = Number((b.maxX - b.minX).toFixed(3));
                    row.height = Number((b.maxY - b.minY).toFixed(3));
                }
                rows.push(row);
            }
        }
        return rows;
    }

    triggerDownload(filename, content, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    exportCsv() {
        if (!this.solution || !this.nester) {
            this.showError('No results to export.');
            return;
        }
        const includeDimensions = Boolean(this.elements.exportDimensions.checked);
        const rows = this.getPlacementRows(includeDimensions);
        const header = includeDimensions
            ? ['sheet', 'order', 'templateId', 'angle', 'x', 'y', 'minX', 'minY', 'maxX', 'maxY', 'width', 'height', 'shapeType']
            : ['sheet', 'order', 'templateId', 'angle', 'x', 'y', 'shapeType'];
        const lines = [header.join(',')];
        for (const row of rows) {
            lines.push(header.map(h => row[h]).join(','));
        }
        this.triggerDownload('nesting_placements.csv', lines.join('\n'), 'text/csv;charset=utf-8');
        this.showSuccess('CSV exported.');
    }

    exportJson() {
        if (!this.solution || !this.nester) {
            this.showError('No results to export.');
            return;
        }
        const includeDimensions = Boolean(this.elements.exportDimensions.checked);
        const stats = this.nester.getStatistics(this.solution);
        const payload = {
            drawingNo: (this.elements.drawingNo.value || '').trim() || this.deriveDrawingNoFromFilename(this.currentDxfFileName),
            generatedAt: new Date().toISOString(),
            seed: parseInt(this.elements.randomSeed.value, 10) || 0,
            includeDimensions,
            paper: {
                width: parseInt(this.elements.paperWidth.value, 10),
                height: parseInt(this.elements.paperHeight.value, 10)
            },
            stats,
            placements: this.getPlacementRows(includeDimensions)
        };
        this.triggerDownload('nesting_placements.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
        this.showSuccess('JSON exported.');
    }

    exportSvg() {
        if (!this.solution || !this.nester) {
            this.showError('No results to export.');
            return;
        }
        const includeDimensions = Boolean(this.elements.exportDimensions.checked);

        const paperW = parseInt(this.elements.paperWidth.value, 10);
        const paperH = parseInt(this.elements.paperHeight.value, 10);
        const gap = 40;
        const totalH = this.solution.sheets.length * (paperH + gap);
        const width = paperW + 30;
        const colorForAngle = (angle) => {
            const palette = ['#2f6db5', '#2fb58f', '#b56b2f', '#7a5bd6', '#d35f9f', '#e2a31f'];
            const norm = Math.round((((angle || 0) % 360) + 360) % 360);
            return palette[norm % palette.length];
        };

        const pieces = [];
        pieces.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalH + 30}" viewBox="0 0 ${width} ${totalH + 30}">`);
        pieces.push('<rect width="100%" height="100%" fill="#ffffff"/>');

        for (let s = 0; s < this.solution.sheets.length; s++) {
            const yOff = s * (paperH + gap) + 20;
            const sheet = this.solution.sheets[s];
            const util = this.getSheetUtilizationFromPlacements(sheet);
            const label = this.escapeXml(this.buildSheetLabel({
                sheetNumber: s + 1,
                totalSheets: this.solution.sheets.length,
                segments: sheet.length,
                utilization: util,
                angles: this.getSheetAnglesCount(sheet)
            }));

            pieces.push(`<g transform="translate(15,${yOff})">`);
            pieces.push(`<rect x="0" y="0" width="${paperW}" height="${paperH}" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>`);
            pieces.push(`<text x="2" y="-6" fill="#334155" font-size="10" font-family="Arial, sans-serif">${label}</text>`);

            for (const placement of sheet) {
                const color = colorForAngle(placement.angle);
                const abs = Geometry.translateShape(placement.shape, placement.x, placement.y);
                const bounds = Geometry.getShapeBounds(abs);
                if (placement.shape.type === 'polygon') {
                    const points = placement.shape.points.map(p => `${(placement.x + p.x).toFixed(3)},${(placement.y + p.y).toFixed(3)}`).join(' ');
                    pieces.push(`<polygon points="${points}" fill="${color}" fill-opacity="0.65" stroke="${color}" stroke-width="1"/>`);
                } else if (placement.shape.type === 'rectangle') {
                    pieces.push(
                        `<rect x="${(placement.x + placement.shape.x).toFixed(3)}" y="${(placement.y + placement.shape.y).toFixed(3)}" ` +
                        `width="${placement.shape.width.toFixed(3)}" height="${placement.shape.height.toFixed(3)}" ` +
                        `fill="${color}" fill-opacity="0.65" stroke="${color}" stroke-width="1"/>`
                    );
                } else if (placement.shape.type === 'circle') {
                    pieces.push(
                        `<circle cx="${(placement.x + placement.shape.x).toFixed(3)}" cy="${(placement.y + placement.shape.y).toFixed(3)}" ` +
                        `r="${placement.shape.radius.toFixed(3)}" fill="${color}" fill-opacity="0.65" stroke="${color}" stroke-width="1"/>`
                    );
                }
                if (includeDimensions) {
                    const cx = (bounds.minX + bounds.maxX) * 0.5;
                    const cy = (bounds.minY + bounds.maxY) * 0.5;
                    pieces.push(`<line x1="0" y1="${cy.toFixed(3)}" x2="${bounds.minX.toFixed(3)}" y2="${cy.toFixed(3)}" stroke="#64748b" stroke-width="0.5" stroke-dasharray="2 2"/>`);
                    pieces.push(`<line x1="${cx.toFixed(3)}" y1="0" x2="${cx.toFixed(3)}" y2="${bounds.minY.toFixed(3)}" stroke="#64748b" stroke-width="0.5" stroke-dasharray="2 2"/>`);
                    pieces.push(`<text x="${(bounds.minX + 1).toFixed(3)}" y="${Math.max(8, bounds.minY - 1).toFixed(3)}" fill="#334155" font-size="5.5" font-family="Arial, sans-serif">x=${bounds.minX.toFixed(1)} y=${bounds.minY.toFixed(1)}</text>`);
                }
            }
            pieces.push('</g>');
        }
        pieces.push('</svg>');
        this.triggerDownload('nesting_layout.svg', pieces.join('\n'), 'image/svg+xml;charset=utf-8');
        this.showSuccess('SVG exported.');
    }

    escapeXml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    buildVectorPdf(solution, stats, paperWidthMm, paperHeightMm, includeDimensions = false) {
        const mmToPt = 72 / 25.4;
        const marginPt = 24;
        const pageWidthPt = paperWidthMm * mmToPt + marginPt * 2;
        const pageHeightPt = paperHeightMm * mmToPt + marginPt * 2;

        const toPt = (xMm, yMm) => ({
            x: marginPt + xMm * mmToPt,
            y: pageHeightPt - marginPt - yMm * mmToPt
        });

        const colorForAngle = (angle) => {
            const palette = [
                [0.19, 0.43, 0.71],
                [0.18, 0.71, 0.56],
                [0.71, 0.42, 0.19],
                [0.48, 0.36, 0.84],
                [0.83, 0.37, 0.62],
                [0.88, 0.64, 0.12]
            ];
            const normalized = Math.round((((angle || 0) % 360) + 360) % 360);
            return palette[normalized % palette.length];
        };

        const escapePdfText = (text) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

        const drawPolygon = (ops, placement, points) => {
            if (!points || points.length < 3) return;
            const first = toPt(placement.x + points[0].x, placement.y + points[0].y);
            ops.push(`${first.x.toFixed(3)} ${first.y.toFixed(3)} m`);
            for (let i = 1; i < points.length; i++) {
                const p = toPt(placement.x + points[i].x, placement.y + points[i].y);
                ops.push(`${p.x.toFixed(3)} ${p.y.toFixed(3)} l`);
            }
            ops.push('h B');
        };

        const drawRectangle = (ops, placement, shape) => {
            const p1 = toPt(placement.x + shape.x, placement.y + shape.y);
            const p2 = toPt(placement.x + shape.x + shape.width, placement.y + shape.y + shape.height);
            const x = Math.min(p1.x, p2.x);
            const y = Math.min(p1.y, p2.y);
            const w = Math.abs(p2.x - p1.x);
            const h = Math.abs(p2.y - p1.y);
            ops.push(`${x.toFixed(3)} ${y.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)} re B`);
        };

        const drawCircle = (ops, placement, shape) => {
            const c = toPt(placement.x + shape.x, placement.y + shape.y);
            const r = shape.radius * mmToPt;
            const k = 0.5522847498 * r;
            const p0 = { x: c.x + r, y: c.y };
            const p1 = { x: c.x + r, y: c.y + k };
            const p2 = { x: c.x + k, y: c.y + r };
            const p3 = { x: c.x, y: c.y + r };
            const p4 = { x: c.x - k, y: c.y + r };
            const p5 = { x: c.x - r, y: c.y + k };
            const p6 = { x: c.x - r, y: c.y };
            const p7 = { x: c.x - r, y: c.y - k };
            const p8 = { x: c.x - k, y: c.y - r };
            const p9 = { x: c.x, y: c.y - r };
            const p10 = { x: c.x + k, y: c.y - r };
            const p11 = { x: c.x + r, y: c.y - k };
            ops.push(`${p0.x.toFixed(3)} ${p0.y.toFixed(3)} m`);
            ops.push(`${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} ${p3.x.toFixed(3)} ${p3.y.toFixed(3)} c`);
            ops.push(`${p4.x.toFixed(3)} ${p4.y.toFixed(3)} ${p5.x.toFixed(3)} ${p5.y.toFixed(3)} ${p6.x.toFixed(3)} ${p6.y.toFixed(3)} c`);
            ops.push(`${p7.x.toFixed(3)} ${p7.y.toFixed(3)} ${p8.x.toFixed(3)} ${p8.y.toFixed(3)} ${p9.x.toFixed(3)} ${p9.y.toFixed(3)} c`);
            ops.push(`${p10.x.toFixed(3)} ${p10.y.toFixed(3)} ${p11.x.toFixed(3)} ${p11.y.toFixed(3)} ${p0.x.toFixed(3)} ${p0.y.toFixed(3)} c`);
            ops.push('B');
        };

        const objectBodies = {};
        const fontObjectId = 3;
        objectBodies[fontObjectId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

        const pageObjectIds = [];
        const pageCount = solution.sheets.length;

        for (let i = 0; i < pageCount; i++) {
            const pageObjId = 4 + i * 2;
            const contentObjId = pageObjId + 1;
            pageObjectIds.push(pageObjId);

            const sheet = solution.sheets[i];
            const util = stats.sheetData[i]?.utilizationPercent || '0.0';
            const label = this.buildSheetLabel({
                sheetNumber: i + 1,
                totalSheets: pageCount,
                segments: sheet.length,
                utilization: util,
                angles: this.getSheetAnglesCount(sheet)
            });
            const ops = [];

            const paperW = paperWidthMm * mmToPt;
            const paperH = paperHeightMm * mmToPt;
            ops.push('q');
            ops.push('0.97 0.98 0.99 rg');
            ops.push('0.25 0.25 0.25 RG');
            ops.push(`${marginPt.toFixed(3)} ${marginPt.toFixed(3)} ${paperW.toFixed(3)} ${paperH.toFixed(3)} re B`);
            ops.push('Q');

            ops.push('BT');
            ops.push('/F1 12 Tf');
            ops.push('0.10 0.10 0.10 rg');
            ops.push(`${marginPt.toFixed(3)} ${(pageHeightPt - 16).toFixed(3)} Td (${escapePdfText(label)}) Tj`);
            ops.push('ET');

            ops.push('0.6 w');
            for (const placement of sheet) {
                const [r, g, b] = colorForAngle(placement.angle || 0);
                ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
                ops.push(`${Math.max(0, r - 0.10).toFixed(3)} ${Math.max(0, g - 0.10).toFixed(3)} ${Math.max(0, b - 0.10).toFixed(3)} RG`);

                if (placement.shape.type === 'polygon') {
                    drawPolygon(ops, placement, placement.shape.points);
                } else if (placement.shape.type === 'rectangle') {
                    drawRectangle(ops, placement, placement.shape);
                } else if (placement.shape.type === 'circle') {
                    drawCircle(ops, placement, placement.shape);
                }

                if (includeDimensions) {
                    const abs = Geometry.translateShape(placement.shape, placement.x, placement.y);
                    const bnd = Geometry.getShapeBounds(abs);
                    const cyMm = (bnd.minY + bnd.maxY) * 0.5;
                    const cxMm = (bnd.minX + bnd.maxX) * 0.5;
                    const p1 = toPt(0, cyMm);
                    const p2 = toPt(bnd.minX, cyMm);
                    const p3 = toPt(cxMm, 0);
                    const p4 = toPt(cxMm, bnd.minY);

                    ops.push('0.35 w');
                    ops.push('0.35 0.43 0.53 RG');
                    ops.push(`${p1.x.toFixed(3)} ${p1.y.toFixed(3)} m ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} l S`);
                    ops.push(`${p3.x.toFixed(3)} ${p3.y.toFixed(3)} m ${p4.x.toFixed(3)} ${p4.y.toFixed(3)} l S`);

                    const labelPt = toPt(Math.max(0, bnd.minX + 1.2), Math.max(0, bnd.minY + 1.2));
                    const label = `x=${bnd.minX.toFixed(1)} y=${bnd.minY.toFixed(1)}`;
                    ops.push('BT');
                    ops.push('/F1 7 Tf');
                    ops.push('0.24 0.30 0.39 rg');
                    ops.push(`${labelPt.x.toFixed(3)} ${labelPt.y.toFixed(3)} Td (${escapePdfText(label)}) Tj`);
                    ops.push('ET');
                }
            }

            const content = ops.join('\n');
            objectBodies[contentObjId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
            objectBodies[pageObjId] =
                `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(3)} ${pageHeightPt.toFixed(3)}] ` +
                `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjId} 0 R >>`;
        }

        objectBodies[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;
        objectBodies[1] = '<< /Type /Catalog /Pages 2 0 R >>';

        const maxObjectId = 3 + pageCount * 2;
        let pdf = '%PDF-1.4\n';
        const offsets = [0];

        for (let id = 1; id <= maxObjectId; id++) {
            offsets[id] = pdf.length;
            pdf += `${id} 0 obj\n${objectBodies[id]}\nendobj\n`;
        }

        const xrefStart = pdf.length;
        pdf += `xref\n0 ${maxObjectId + 1}\n`;
        pdf += '0000000000 65535 f \n';
        for (let id = 1; id <= maxObjectId; id++) {
            pdf += `${offsets[id].toString().padStart(10, '0')} 00000 n \n`;
        }
        pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

        return new TextEncoder().encode(pdf);
    }

    resetForm() {
        this.elements.dxfUpload.value = '';
        this.applySettings(this.getActiveDefaults());
        this.resetEverything();
    }

    getBuiltInDefaults() {
        return {
            paperWidth: 1000,
            paperHeight: 1000,
            marginTop: 10,
            marginLeft: 10,
            padding: 5,
            orientations: 2,
            sheetsLimit: 1,
            randomSeed: 2026,
            exportDimensions: false,
            drawingNo: '',
            sheetLabelTemplate: '{drawingNo} | Segments {segments} | Utilization {utilization}%'
        };
    }

    getCurrentFormSettings() {
        return {
            paperWidth: parseInt(this.elements.paperWidth.value, 10),
            paperHeight: parseInt(this.elements.paperHeight.value, 10),
            marginTop: parseInt(this.elements.marginTop.value, 10),
            marginLeft: parseInt(this.elements.marginLeft.value, 10),
            padding: parseInt(this.elements.padding.value, 10),
            orientations: parseInt(this.elements.orientations.value, 10),
            sheetsLimit: parseInt(this.elements.sheetsLimit.value, 10),
            randomSeed: parseInt(this.elements.randomSeed.value, 10),
            exportDimensions: Boolean(this.elements.exportDimensions.checked),
            drawingNo: this.elements.drawingNo.value || '',
            sheetLabelTemplate: this.elements.sheetLabelTemplate.value || ''
        };
    }

    sanitizeSettings(raw) {
        const builtIn = this.getBuiltInDefaults();
        const num = (v, fallback) => Number.isFinite(v) ? v : fallback;
        return {
            paperWidth: Math.max(100, num(parseInt(raw.paperWidth, 10), builtIn.paperWidth)),
            paperHeight: Math.max(100, num(parseInt(raw.paperHeight, 10), builtIn.paperHeight)),
            marginTop: Math.max(0, num(parseInt(raw.marginTop, 10), builtIn.marginTop)),
            marginLeft: Math.max(0, num(parseInt(raw.marginLeft, 10), builtIn.marginLeft)),
            padding: Math.max(0, num(parseInt(raw.padding, 10), builtIn.padding)),
            orientations: Math.min(360, Math.max(1, num(parseInt(raw.orientations, 10), builtIn.orientations))),
            sheetsLimit: Math.max(1, num(parseInt(raw.sheetsLimit, 10), builtIn.sheetsLimit)),
            randomSeed: Math.max(1, num(parseInt(raw.randomSeed, 10), builtIn.randomSeed)),
            exportDimensions: typeof raw.exportDimensions === 'boolean' ? raw.exportDimensions : builtIn.exportDimensions,
            drawingNo: typeof raw.drawingNo === 'string' ? raw.drawingNo : builtIn.drawingNo,
            sheetLabelTemplate: typeof raw.sheetLabelTemplate === 'string' && raw.sheetLabelTemplate.trim().length > 0
                ? raw.sheetLabelTemplate
                : builtIn.sheetLabelTemplate
        };
    }

    applySettings(settings) {
        const s = this.sanitizeSettings(settings || {});
        this.elements.paperWidth.value = s.paperWidth;
        this.elements.paperHeight.value = s.paperHeight;
        this.elements.marginTop.value = s.marginTop;
        this.elements.marginLeft.value = s.marginLeft;
        this.elements.padding.value = s.padding;
        this.elements.orientations.value = s.orientations;
        this.elements.sheetsLimit.value = s.sheetsLimit;
        this.elements.randomSeed.value = s.randomSeed;
        this.elements.exportDimensions.checked = Boolean(s.exportDimensions);
        this.elements.drawingNo.value = s.drawingNo;
        this.elements.sheetLabelTemplate.value = s.sheetLabelTemplate;
        this.updateConstraintStatus();
    }

    readStoredDefaults() {
        try {
            const raw = localStorage.getItem(this.defaultsStorageKey);
            if (!raw) return null;
            return this.sanitizeSettings(JSON.parse(raw));
        } catch {
            return null;
        }
    }

    getActiveDefaults() {
        return this.readStoredDefaults() || this.getBuiltInDefaults();
    }

    saveCurrentAsDefaults() {
        const settings = this.sanitizeSettings(this.getCurrentFormSettings());
        localStorage.setItem(this.defaultsStorageKey, JSON.stringify(settings));
        this.showSuccess('Defaults saved.');
    }

    loadDefaultsToForm() {
        this.applySettings(this.getActiveDefaults());
        this.showSuccess('Defaults loaded.');
    }

    resetStoredDefaults() {
        localStorage.removeItem(this.defaultsStorageKey);
        this.applySettings(this.getBuiltInDefaults());
        this.showSuccess('Defaults reset to built-in values.');
    }

    resetEverything() {
        this.solution = null;
        this.shapes = [];
        this.currentSheetIndex = 0;
        this.elements.resultsInfo.innerHTML = '<div class="info-box"><p>Waiting for optimization...</p></div>';
        this.elements.statisticsTable.innerHTML = '';
        this.elements.geometryInfo.innerHTML = 'No file loaded.';
        this.elements.exportResults.disabled = true;
        this.elements.exportCsv.disabled = true;
        this.elements.exportJson.disabled = true;
        this.elements.exportSvg.disabled = true;
        this.visualization.drawEmpty();
        this.updateConstraintStatus();
    }

    resetResults() {
        this.solution = null;
        this.currentSheetIndex = 0;
        this.elements.resultsInfo.innerHTML = '<div class="info-box"><p>Waiting for optimization...</p></div>';
        this.elements.statisticsTable.innerHTML = '';
        this.elements.exportResults.disabled = true;
        this.elements.exportCsv.disabled = true;
        this.elements.exportJson.disabled = true;
        this.elements.exportSvg.disabled = true;
        this.visualization.drawEmpty();
        this.updateConstraintStatus();
    }

    setLoading(loading, estimatedMs = 1200) {
        if (loading) {
            this.elements.runOptimization.disabled = true;
            this.elements.runOptimization.innerHTML = 'Running <span class="loading"></span>';
            this.startProgress(estimatedMs);
        } else {
            this.stopProgress();
            this.elements.runOptimization.textContent = 'Run Optimization';
            this.updateConstraintStatus();
        }
    }

    showError(message) {
        this.elements.resultsInfo.innerHTML = `<div class="info-box error">${message}</div>`;
    }

    showSuccess(message) {
        const box = document.createElement('div');
        box.className = 'info-box success';
        box.textContent = message;
        this.elements.resultsInfo.appendChild(box);

        setTimeout(() => {
            box.remove();
        }, 2500);
    }
}

// Initialize app when DOM is ready
const KILL_SWITCH_CONFIG = {
    gistRawUrl: (window.NESTER_KILLSWITCH_GIST_RAW_URL || '').trim(),
    timeoutMs: 2500
};

function isKillSwitchEnabledPayload(value) {
    if (typeof value !== 'string') return false;
    return value.trim() === '1';
}

async function fetchKillSwitchEnabled() {
    if (!KILL_SWITCH_CONFIG.gistRawUrl) {
        return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), KILL_SWITCH_CONFIG.timeoutMs);

    try {
        const url = new URL(KILL_SWITCH_CONFIG.gistRawUrl);
        url.searchParams.set('_ks_ts', String(Date.now()));

        const response = await fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, max-age=0',
                Pragma: 'no-cache'
            },
            signal: controller.signal
        });

        if (!response.ok) {
            console.warn('Kill switch check failed:', response.status, response.statusText);
            return false;
        }

        const text = await response.text();
        return isKillSwitchEnabledPayload(text);
    } catch (error) {
        console.warn('Kill switch check error:', error);
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

function watchForLicenseRecovery() {
    const checkIntervalMs = 5000;
    const intervalId = setInterval(async () => {
        const stillBlocked = await fetchKillSwitchEnabled();
        if (!stillBlocked) {
            clearInterval(intervalId);
            window.location.reload();
        }
    }, checkIntervalMs);
}

function disableUiForKillSwitch() {
    showNoLicenseBanner();

    document.querySelectorAll('input, button, select, textarea').forEach((el) => {
        el.disabled = true;
    });

    const resultsInfo = document.getElementById('resultsInfo');
    if (resultsInfo) {
        resultsInfo.innerHTML = '<div class="info-box error"><strong>No license found</strong><br>Please contact support.</div>';
    }

    const canvasInfo = document.getElementById('canvasInfo');
    if (canvasInfo) {
        canvasInfo.innerHTML = '<p>No license found.</p>';
    }
}

function showNoLicenseBanner() {
    if (document.getElementById('licenseBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'licenseBanner';
    banner.className = 'license-banner';
    banner.textContent = 'No license found';
    document.body.prepend(banner);
}

async function stopServiceWorkers() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
    } catch (error) {
        console.warn('Failed to unregister service workers:', error);
    }
}

async function bootApp() {
    const killSwitchEnabled = await fetchKillSwitchEnabled();
    if (killSwitchEnabled) {
        await stopServiceWorkers();
        disableUiForKillSwitch();
        watchForLicenseRecovery();
        return;
    }

    window.app = new NesterApp();
}

document.addEventListener('DOMContentLoaded', () => {
    bootApp();
});
