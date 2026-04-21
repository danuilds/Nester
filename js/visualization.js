/**
 * Visualization module for drawing nesting results on canvas
 */
class Visualization {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.paperWidth = 1000;
        this.paperHeight = 1000;
        this.shapes = [];
        this.placements = [];
        this.selectedPlacement = null;
    }

    setDimensions(width, height) {
        // Adjust canvas size to fit container and maintain aspect ratio
        const container = this.canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        const maxWidth = Math.min(containerRect.width - 40, 800);
        
        this.canvas.width = maxWidth;
        this.canvas.height = Math.min(containerRect.height - 40, (maxWidth / width) * height);
        
        this.paperWidth = width;
        this.paperHeight = height;
        this.fitToCanvas();
    }

    fitToCanvas() {
        const padding = 20;
        const aspectRatio = this.paperWidth / this.paperHeight;
        const canvasAspectRatio = this.canvas.width / this.canvas.height;

        if (canvasAspectRatio > aspectRatio) {
            this.scale = (this.canvas.height - 2 * padding) / this.paperHeight;
        } else {
            this.scale = (this.canvas.width - 2 * padding) / this.paperWidth;
        }

        this.offsetX = (this.canvas.width - this.paperWidth * this.scale) / 2;
        this.offsetY = (this.canvas.height - this.paperHeight * this.scale) / 2;
    }

    drawSheet(placements, sheetNumber = 1, totalSheets = 1) {
        this.placements = placements;
        this.clear();
        this.drawPaper();
        this.drawPlacements(placements);
        this.drawInfo(sheetNumber, totalSheets);
    }

    clear() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawPaper() {
        const x = this.offsetX;
        const y = this.offsetY;
        const w = this.paperWidth * this.scale;
        const h = this.paperHeight * this.scale;

        // Paper background
        this.ctx.fillStyle = '#fafafa';
        this.ctx.fillRect(x, y, w, h);

        // Paper border
        this.ctx.strokeStyle = '#333';
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

        // Choose color based on index
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
            '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
        ];
        const color = colors[index % colors.length];

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

        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.7;
        this.ctx.beginPath();

        const firstPoint = shape.points[0];
        this.ctx.moveTo(firstPoint.x * this.scale, firstPoint.y * this.scale);

        for (let i = 1; i < shape.points.length; i++) {
            const point = shape.points[i];
            this.ctx.lineTo(point.x * this.scale, point.y * this.scale);
        }

        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawInfo(sheetNumber, totalSheets) {
        const infoText = `Sheet ${sheetNumber} of ${totalSheets}`;
        this.ctx.fillStyle = '#666';
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(infoText, this.offsetX + 10, this.offsetY - 10);
    }

    drawEmpty() {
        this.clear();
        this.ctx.fillStyle = '#999';
        this.ctx.font = 'bold 16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('No placement data available', this.canvas.width / 2, this.canvas.height / 2);
    }
}
