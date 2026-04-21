/**
 * Visualization module for drawing nesting results on canvas
 */
class Visualization {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.paperWidth = 1000;
        this.paperHeight = 1000;
        this.shapes = [];
        this.placements = [];
        this.selectedPlacement = null;
        this.angleColorMap = new Map();
        this.theme = this.readTheme();

        this.prepareCanvasForHiDPI();
    }

    readTheme() {
        const root = getComputedStyle(document.documentElement);
        return {
            canvasBg: root.getPropertyValue('--canvas-bg').trim() || '#ffffff',
            paperBg: root.getPropertyValue('--paper-bg').trim() || '#f8fafc',
            paperBorder: root.getPropertyValue('--paper-border').trim() || '#4b5563',
            infoMuted: root.getPropertyValue('--info-muted').trim() || '#6b7280'
        };
    }

    prepareCanvasForHiDPI(cssWidth, cssHeight) {
        const width = Math.max(1, Math.floor(cssWidth || this.canvas.clientWidth || 800));
        const height = Math.max(1, Math.floor(cssHeight || this.canvas.clientHeight || 500));

        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.width = Math.floor(width * this.pixelRatio);
        this.canvas.height = Math.floor(height * this.pixelRatio);

        this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }

    setDimensions(width, height) {
        // Adjust canvas size to fit container and maintain aspect ratio
        const container = this.canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        const maxWidth = Math.min(containerRect.width - 40, 800);
        const targetHeight = Math.min(containerRect.height - 40, (maxWidth / width) * height);

        this.prepareCanvasForHiDPI(maxWidth, targetHeight);
        
        this.paperWidth = width;
        this.paperHeight = height;
        this.fitToCanvas();
    }

    fitToCanvas() {
        const padding = 20;
        const aspectRatio = this.paperWidth / this.paperHeight;
        const canvasCssWidth = this.canvas.width / this.pixelRatio;
        const canvasCssHeight = this.canvas.height / this.pixelRatio;
        const canvasAspectRatio = canvasCssWidth / canvasCssHeight;

        if (canvasAspectRatio > aspectRatio) {
            this.scale = (canvasCssHeight - 2 * padding) / this.paperHeight;
        } else {
            this.scale = (canvasCssWidth - 2 * padding) / this.paperWidth;
        }

        this.offsetX = (canvasCssWidth - this.paperWidth * this.scale) / 2;
        this.offsetY = (canvasCssHeight - this.paperHeight * this.scale) / 2;
    }

    drawSheet(placements, sheetNumber = 1, totalSheets = 1, sheetLabel = '') {
        this.placements = placements;
        this.rebuildAngleColorMap(placements);
        this.clear();
        this.drawPaper();
        this.drawPlacements(placements);
        this.drawInfo(sheetNumber, totalSheets, sheetLabel);
    }

    drawWorkingPreview(placements, candidate, candidateStatus = 'trying', sheetNumber = 1, sheetLabel = '') {
        this.drawSheet(placements, sheetNumber, '...', sheetLabel);

        if (candidate) {
            this.drawCandidateOverlay(candidate, candidateStatus);
        }
    }

    clear() {
        this.theme = this.readTheme();
        this.ctx.fillStyle = this.theme.canvasBg;
        this.ctx.fillRect(0, 0, this.canvas.width / this.pixelRatio, this.canvas.height / this.pixelRatio);
    }

    drawPaper() {
        const x = this.offsetX;
        const y = this.offsetY;
        const w = this.paperWidth * this.scale;
        const h = this.paperHeight * this.scale;

        // Paper background
        this.ctx.fillStyle = this.theme.paperBg;
        this.ctx.fillRect(x, y, w, h);

        // Paper border
        this.ctx.strokeStyle = this.theme.paperBorder;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, w, h);
    }

    drawPlacements(placements) {
        placements.forEach((placement, index) => {
            this.drawPlacement(placement, index);
        });
    }

    drawPlacement(placement, index) {
        const shape = placement.shape;
        const x = this.offsetX + placement.x * this.scale;
        const y = this.offsetY + placement.y * this.scale;

        const color = this.getColorForPlacement(placement, index);

        this.ctx.save();
        this.ctx.translate(x, y);

        if (shape.type === 'circle') {
            this.drawCircle(shape, color);
        } else if (shape.type === 'rectangle') {
            this.drawRectangle(shape, color);
        } else if (shape.type === 'polygon') {
            this.drawPolygon(shape, color);
        }

        this.ctx.restore();
    }

    getColorForPlacement(placement, index) {
        if (typeof placement.angle === 'number') {
            const key = this.normalizeAngleKey(placement.angle);
            return this.angleColorMap.get(key) || '#2f6db5';
        }

        return '#2f6db5';
    }

    normalizeAngleKey(angle) {
        const normalized = ((angle % 360) + 360) % 360;
        return normalized.toFixed(1);
    }

    rebuildAngleColorMap(placements) {
        this.angleColorMap.clear();
        const palette = ['#2f6db5', '#2fb58f', '#b56b2f', '#7a5bd6', '#d35f9f', '#e2a31f'];

        for (const placement of placements) {
            if (typeof placement.angle !== 'number') continue;
            const key = this.normalizeAngleKey(placement.angle);
            if (!this.angleColorMap.has(key)) {
                const idx = this.angleColorMap.size % palette.length;
                this.angleColorMap.set(key, palette[idx]);
            }
        }
    }

    drawCandidateOverlay(placement, status = 'trying') {
        const x = this.offsetX + placement.x * this.scale;
        const y = this.offsetY + placement.y * this.scale;
        const shape = placement.shape;

        const styleByStatus = {
            trying: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.22)' },
            invalid: { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.18)' },
            placed: { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.2)' }
        };
        const style = styleByStatus[status] || styleByStatus.trying;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.fillStyle = style.fill;
        this.ctx.strokeStyle = style.stroke;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 4]);

        if (shape.type === 'circle') {
            this.ctx.beginPath();
            this.ctx.arc(shape.x * this.scale, shape.y * this.scale, shape.radius * this.scale, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        } else if (shape.type === 'rectangle') {
            this.ctx.fillRect(
                shape.x * this.scale,
                shape.y * this.scale,
                shape.width * this.scale,
                shape.height * this.scale
            );
            this.ctx.strokeRect(
                shape.x * this.scale,
                shape.y * this.scale,
                shape.width * this.scale,
                shape.height * this.scale
            );
        } else if (shape.type === 'polygon' && shape.points.length > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(shape.points[0].x * this.scale, shape.points[0].y * this.scale);
            for (let i = 1; i < shape.points.length; i++) {
                this.ctx.lineTo(shape.points[i].x * this.scale, shape.points[i].y * this.scale);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawCircle(shape, color) {
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.7;
        this.ctx.beginPath();
        this.ctx.arc(shape.x * this.scale, shape.y * this.scale, shape.radius * this.scale, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawRectangle(shape, color) {
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.7;
        this.ctx.fillRect(
            shape.x * this.scale,
            shape.y * this.scale,
            shape.width * this.scale,
            shape.height * this.scale
        );

        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
            shape.x * this.scale,
            shape.y * this.scale,
            shape.width * this.scale,
            shape.height * this.scale
        );
    }

    drawPolygon(shape, color) {
        if (!shape.points || shape.points.length === 0) return;
        const points = this.normalizePolygonPointsForRender(shape.points);
        if (points.length < 3) return;

        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.7;
        this.ctx.beginPath();

        const firstPoint = points[0];
        this.ctx.moveTo(firstPoint.x * this.scale, firstPoint.y * this.scale);

        for (let i = 1; i < points.length; i++) {
            const point = points[i];
            this.ctx.lineTo(point.x * this.scale, point.y * this.scale);
        }

        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    normalizePolygonPointsForRender(points) {
        if (points.length < 4) {
            return points;
        }

        const edgeLengths = [];
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            const dy = points[i + 1].y - points[i].y;
            edgeLengths.push(Math.hypot(dx, dy));
        }

        const meanEdge = edgeLengths.reduce((a, b) => a + b, 0) / Math.max(1, edgeLengths.length);
        const first = points[0];
        const last = points[points.length - 1];
        const closingEdge = Math.hypot(first.x - last.x, first.y - last.y);

        // Some imported outlines include a trailing stray point.
        // If the implicit closing edge is abnormally large, drop the last point for rendering.
        if (closingEdge > meanEdge * 6) {
            return points.slice(0, -1);
        }

        return points;
    }

    drawInfo(sheetNumber, totalSheets, sheetLabel = '') {
        const infoText = sheetLabel && sheetLabel.trim().length > 0
            ? sheetLabel
            : `Sheet ${sheetNumber} of ${totalSheets}`;
        this.ctx.fillStyle = this.theme.infoMuted;
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(infoText, this.offsetX + 10, this.offsetY - 10);
    }

    drawEmpty() {
        this.prepareCanvasForHiDPI();
        this.clear();
        this.ctx.fillStyle = this.theme.infoMuted;
        this.ctx.font = '600 20px "Avenir Next", "Segoe UI", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(
            'No placement data available',
            (this.canvas.width / this.pixelRatio) / 2,
            (this.canvas.height / this.pixelRatio) / 2
        );
    }
}
