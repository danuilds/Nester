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
        this.init();
    }

    init() {
        this.setupElements();
        this.attachEventListeners();
        this.visualization = new Visualization(document.getElementById('nestingCanvas'));
    }

    setupElements() {
        this.elements = {
            // Input fields
            paperWidth: document.getElementById('paperWidth'),
            paperHeight: document.getElementById('paperHeight'),
            marginTop: document.getElementById('marginTop'),
            marginLeft: document.getElementById('marginLeft'),
            padding: document.getElementById('padding'),
            dxfUpload: document.getElementById('dxfUpload'),
            orientations: document.getElementById('orientations'),
            sheetsLimit: document.getElementById('sheetsLimit'),
            populationSize: document.getElementById('populationSize'),
            generations: document.getElementById('generations'),

            // Buttons
            runOptimization: document.getElementById('runOptimization'),
            resetForm: document.getElementById('resetForm'),
            exportResults: document.getElementById('exportResults'),
            nextSheet: document.getElementById('nextSheet'),
            prevSheet: document.getElementById('prevSheet'),
            loadSample: document.getElementById('loadSample'),

            // Display areas
            geometryInfo: document.getElementById('geometryInfo'),
            resultsInfo: document.getElementById('resultsInfo'),
            canvasInfo: document.getElementById('canvasInfo'),
            statisticsTable: document.getElementById('statisticsTable'),
            nestingCanvas: document.getElementById('nestingCanvas')
        };
    }

    attachEventListeners() {
        this.elements.dxfUpload.addEventListener('change', (e) => this.handleDXFUpload(e));
        this.elements.loadSample.addEventListener('click', () => this.loadSampleDXF());
        this.elements.runOptimization.addEventListener('click', () => this.runOptimization());
        this.elements.resetForm.addEventListener('click', () => this.resetForm());
        this.elements.exportResults.addEventListener('click', () => this.exportResults());
        this.elements.nextSheet.addEventListener('click', () => this.showNextSheet());
        this.elements.prevSheet.addEventListener('click', () => this.showPrevSheet());

        // Update canvas on window resize
        window.addEventListener('resize', () => {
            if (this.visualization && this.solution) {
                this.visualization.setDimensions(
                    parseInt(this.elements.paperWidth.value),
                    parseInt(this.elements.paperHeight.value)
                );
                this.showSheet(this.currentSheetIndex);
            }
        });
    }

    handleDXFUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const dxfText = e.target.result;
                if (!dxfText || dxfText.trim().length === 0) {
                    this.showError('Uploaded file is empty');
                    return;
                }
                
                console.log('DXF upload - FILE CONTENT LENGTH:', dxfText.length);
                const result = DXFParser.parse(dxfText);
                console.log('DXF upload - PARSE RESULT:', result);
                console.log('DXF upload - RESULT IS ARRAY:', Array.isArray(result));
                console.log('DXF upload - RESULT LENGTH:', result ? result.length : 'undefined');
                
                this.shapes = result;
                console.log('DXF upload - THIS.SHAPES:', this.shapes);
                console.log('DXF upload - THIS.SHAPES.LENGTH:', this.shapes ? this.shapes.length : 'undefined');
                
                if (!this.shapes || !Array.isArray(this.shapes) || this.shapes.length === 0) {
                    this.showError('No valid shapes found in DXF file. Please check the file format.');
                    this.elements.geometryInfo.innerHTML = '<strong>File loaded</strong><br>⚠ No shapes parsed';
                    console.error('Upload failed - no shapes or not an array');
                    return;
                }
                
                console.log('Upload success - loaded', this.shapes.length, 'shapes');
                this.updateGeometryInfo();
                this.resetResults();
                this.showSuccess('DXF file loaded successfully with ' + this.shapes.length + ' shape(s)');
            } catch (error) {
                console.error('Exception in handleDXFUpload:', error);
                this.showError('Error parsing DXF file: ' + error.message);
            }
        };
        reader.onerror = () => {
            this.showError('Error reading file');
        };
        reader.readAsText(file);
    }

    loadSampleDXF() {
        const sampleDXF = this.createSampleDXF();
        console.log('Loading sample DXF, length:', sampleDXF.length);
        this.shapes = DXFParser.parse(sampleDXF);
        
        console.log('Loaded shapes:', this.shapes);
        console.log('Shapes length:', this.shapes ? this.shapes.length : 'null');
        
        if (!this.shapes || this.shapes.length === 0) {
            this.showError('Failed to load sample DXF - no shapes parsed');
            this.elements.geometryInfo.innerHTML = '<strong>File loaded</strong><br>⚠ No shapes parsed';
            return;
        }
        
        this.updateGeometryInfo();
        this.resetResults();
        this.showSuccess('Sample DXF loaded with ' + this.shapes.length + ' shapes');
    }

    createSampleDXF() {
        return `  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
CIRCLE
  8
0
 10
100.0
 20
100.0
 40
50.0
  0
CIRCLE
  8
0
 10
250.0
 20
100.0
 40
45.0
  0
CIRCLE
  8
0
 10
150.0
 20
250.0
 40
60.0
  0
LWPOLYLINE
  8
0
 90
4
 10
50.0
 20
400.0
 10
150.0
 20
400.0
 10
200.0
 20
500.0
 10
50.0
 20
500.0
  0
LWPOLYLINE
  8
0
 90
4
 10
300.0
 20
350.0
 10
450.0
 20
350.0
 10
450.0
 20
500.0
 10
300.0
 20
500.0
  0
CIRCLE
  8
0
 10
400.0
 20
200.0
 40
35.0
  0
ENDSEC
  0
EOF`;
    }

    updateGeometryInfo() {
        if (!this.shapes || this.shapes.length === 0) {
            this.elements.geometryInfo.innerHTML = 'No shapes loaded';
            return;
        }
        
        let info = `<strong>✓ Loaded Shapes: ${this.shapes.length}</strong><br>`;
        let totalArea = 0;

        this.shapes.forEach((shape, index) => {
            const area = Geometry.calculateArea(shape);
            totalArea += area;
            const type = shape.type.charAt(0).toUpperCase() + shape.type.slice(1);
            info += `${index + 1}. ${type} (Area: ${area.toFixed(2)})<br>`;
        });

        info += `<br><strong>Total Area: ${totalArea.toFixed(2)}</strong>`;
        this.elements.geometryInfo.innerHTML = info;
    }

    runOptimization() {
        if (this.shapes.length === 0) {
            this.showError('Please load a DXF file first');
            return;
        }

        this.setLoading(true);

        // Simulate async operation
        setTimeout(() => {
            try {
                this.nester = new Nester({
                    paperWidth: parseInt(this.elements.paperWidth.value),
                    paperHeight: parseInt(this.elements.paperHeight.value),
                    margin: parseInt(this.elements.marginLeft.value),
                    padding: parseInt(this.elements.padding.value),
                    maxSheets: parseInt(this.elements.sheetsLimit.value),
                    numOrientations: parseInt(this.elements.orientations.value)
                });

                this.nester.setShapes(this.shapes);
                this.solution = this.nester.solve();

                this.displayResults();
                this.setLoading(false);
            } catch (error) {
                this.showError('Optimization error: ' + error.message);
                this.setLoading(false);
            }
        }, 100);
    }

    displayResults() {
        if (!this.solution || !this.solution.sheets || this.solution.sheets.length === 0) {
            this.showError('No valid solution found');
            return;
        }

        this.currentSheetIndex = 0;

        // Show results info
        const stats = this.nester.getStatistics(this.solution);
        let resultsHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalSheets}</div>
                    <div class="stat-label">Total Sheets</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalSegments}</div>
                    <div class="stat-label">Total Segments</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.avgUtilization}%</div>
                    <div class="stat-label">Avg Utilization</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.fitness}</div>
                    <div class="stat-label">Fitness Score</div>
                </div>
            </div>
        `;
        this.elements.resultsInfo.innerHTML = resultsHTML;

        // Create statistics table
        let tableHTML = '<table class="results-table"><thead><tr><th>Sheet</th><th>Segments</th><th>Utilization</th></tr></thead><tbody>';
        stats.sheetData.forEach(sheet => {
            tableHTML += `<tr><td>Sheet ${sheet.sheetNumber}</td><td>${sheet.segments}</td><td>${sheet.utilizationPercent}%</td></tr>`;
        });
        tableHTML += '</tbody></table>';
        this.elements.statisticsTable.innerHTML = tableHTML;

        // Enable navigation buttons
        this.elements.exportResults.disabled = false;
        this.updateSheetNavigation();

        // Show first sheet
        this.showSheet(0);
    }

    showSheet(index) {
        if (!this.solution || !this.solution.sheets) return;

        if (index < 0) index = 0;
        if (index >= this.solution.sheets.length) index = this.solution.sheets.length - 1;

        this.currentSheetIndex = index;

        // Set canvas dimensions
        this.visualization.setDimensions(
            parseInt(this.elements.paperWidth.value),
            parseInt(this.elements.paperHeight.value)
        );

        // Draw the sheet
        const sheet = this.solution.sheets[index];
        this.visualization.drawSheet(sheet, index + 1, this.solution.sheets.length);

        this.updateSheetNavigation();
    }

    updateSheetNavigation() {
        const totalSheets = this.solution ? this.solution.sheets.length : 0;
        this.elements.nextSheet.disabled = this.currentSheetIndex >= totalSheets - 1;
        this.elements.prevSheet.disabled = this.currentSheetIndex <= 0;
    }

    showNextSheet() {
        this.showSheet(this.currentSheetIndex + 1);
    }

    showPrevSheet() {
        this.showSheet(this.currentSheetIndex - 1);
    }

    exportResults() {
        if (!this.solution || !this.nester) {
            this.showError('No results to export');
            return;
        }

        const stats = this.nester.getStatistics(this.solution);
        let csvContent = 'Sheet,Segments,Utilization %\n';

        stats.sheetData.forEach(sheet => {
            csvContent += `${sheet.sheetNumber},${sheet.segments},${sheet.utilizationPercent}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nesting_results.csv';
        link.click();
        URL.revokeObjectURL(url);

        this.showSuccess('Results exported successfully');
    }

    resetForm() {
        this.elements.dxfUpload.value = '';
        this.elements.paperWidth.value = 1000;
        this.elements.paperHeight.value = 1000;
        this.elements.marginTop.value = 10;
        this.elements.marginLeft.value = 10;
        this.elements.padding.value = 5;
        this.elements.orientations.value = '1';
        this.elements.sheetsLimit.value = 10;
        this.elements.populationSize.value = 50;
        this.elements.generations.value = 100;

        this.resetEverything();
    }

    resetEverything() {
        this.solution = null;
        this.shapes = [];
        this.currentSheetIndex = 0;
        this.elements.resultsInfo.innerHTML = '<p>Waiting for optimization...</p>';
        this.elements.statisticsTable.innerHTML = '';
        this.elements.geometryInfo.innerHTML = 'No file loaded';
        this.elements.exportResults.disabled = true;
        this.elements.nextSheet.disabled = true;
        this.elements.prevSheet.disabled = true;
        this.visualization.drawEmpty();
    }

    resetResults() {
        // Only reset optimization results, NOT geometry info or shapes
        this.solution = null;
        this.currentSheetIndex = 0;
        this.elements.resultsInfo.innerHTML = '<p>Waiting for optimization...</p>';
        this.elements.statisticsTable.innerHTML = '';
        this.elements.exportResults.disabled = true;
        this.elements.nextSheet.disabled = true;
        this.elements.prevSheet.disabled = true;
        this.visualization.drawEmpty();
    }

    setLoading(loading) {
        this.elements.runOptimization.disabled = loading;
        if (loading) {
            this.elements.runOptimization.textContent = 'Running... ';
            this.elements.runOptimization.innerHTML += '<span class="loading"></span>';
        } else {
            this.elements.runOptimization.textContent = 'Run Optimization';
        }
    }

    showError(message) {
        const box = document.createElement('div');
        box.className = 'info-box error';
        box.textContent = message;
        this.elements.resultsInfo.innerHTML = '';
        this.elements.resultsInfo.appendChild(box);
    }

    showSuccess(message) {
        const box = document.createElement('div');
        box.className = 'info-box success';
        box.textContent = message;
        setTimeout(() => {
            box.remove();
        }, 3000);
        this.elements.resultsInfo.appendChild(box);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new NesterApp();
});
