/**
 * Nester v3 (rebuilt):
 * - Contact-point based packing (bottom-left stable)
 * - Spatial hash collision checks
 * - Global orientation limit handling
 * - Baseline vs optimized comparison
 * - Deterministic seeded behavior
 */
class Nester {
    constructor(options = {}) {
        this.paperWidth = options.paperWidth || 1000;
        this.paperHeight = options.paperHeight || 1000;
        this.marginLeft = options.marginLeft ?? options.margin ?? 10;
        this.marginTop = options.marginTop ?? options.margin ?? 10;
        this.padding = options.padding || 5;
        this.maxSheets = Math.max(1, parseInt(options.maxSheets || 1, 10));
        this.maxOrientations = Math.max(1, parseInt(options.numOrientations || 1, 10));
        this.maxPlacementsPerSheet = Math.max(1, parseInt(options.maxPlacementsPerSheet || 2000, 10));

        this.randomSeed = Math.max(1, parseInt(options.randomSeed || 2026, 10));
        this.rngState = this.randomSeed >>> 0;

        this.segmentTemplates = [];
        this.orientationAngles = [];

        this.maxEffectiveOrientations = 36;
        this.maxContactPoints = 3200;
        this.maxAnchorsToProbe = 240;
        this.solutionUtilTieEpsilon = 0.003;
        this.solutionUtilStrongGap = 0.01;
        this.maxPreciseRefinements = 1;

        this.spatialCellSize = 40;
    }

    resetRng(seed) {
        this.rngState = (Math.max(1, parseInt(seed || this.randomSeed, 10)) >>> 0);
    }

    random() {
        this.rngState = (1664525 * this.rngState + 1013904223) >>> 0;
        return this.rngState / 4294967296;
    }

    setShapes(shapes) {
        const effectiveOrientationPool = Math.min(this.maxOrientations, this.maxEffectiveOrientations);
        this.orientationAngles = this.generateOrientationAngles(effectiveOrientationPool);

        let templates = shapes.map((shape, index) => {
            const normalized = Geometry.normalizeShape(shape);
            const rotations = this.orientationAngles.map(angle => ({
                angle,
                shape: Geometry.normalizeShape(Geometry.rotateShape(normalized, angle))
            }));

            const bounds = Geometry.getShapeBounds(normalized);
            return {
                id: index,
                baseShape: normalized,
                area: Geometry.calculateArea(normalized),
                bounds,
                rotations
            };
        }).sort((a, b) => b.area - a.area);

        // Remove tiny artifacts if one dominant entity exists.
        if (templates.length > 1) {
            const largest = templates[0].area;
            const second = templates[1].area;
            if (largest > second * 5) {
                const minAllowedArea = Math.max(50, largest * 0.01);
                templates = templates.filter(t => t.area >= minAllowedArea);
            }
        }

        this.segmentTemplates = templates;

        const avgSpan = templates.length > 0
            ? templates.reduce((sum, t) => sum + Math.max(6, Math.min(t.bounds.width, t.bounds.height)), 0) / templates.length
            : 20;
        this.spatialCellSize = Math.max(16, Math.min(120, avgSpan + this.padding * 2));
    }

    generateOrientationAngles(count) {
        if (count <= 1) return [0];
        const step = 360 / count;
        const angles = [];
        for (let i = 0; i < count; i++) {
            angles.push(parseFloat((i * step).toFixed(6)));
        }
        return angles;
    }

    getOrientationVariantCounts() {
        const effective = Math.min(this.maxOrientations, this.maxEffectiveOrientations);
        if (effective <= 1) return [1];
        if (effective <= 6) {
            const out = [];
            for (let i = 1; i <= effective; i++) out.push(i);
            return out;
        }
        const mid = Math.max(3, Math.round(effective / 2));
        return [...new Set([1, 2, mid, effective])].sort((a, b) => a - b);
    }

    buildRotationSubset(allRotations, limit) {
        if (limit >= allRotations.length) return allRotations;
        const picked = [];
        const used = new Set();
        for (let i = 0; i < limit; i++) {
            const idx = Math.floor((i * allRotations.length) / limit);
            if (!used.has(idx)) {
                used.add(idx);
                picked.push(allRotations[idx]);
            }
        }
        return picked;
    }

    solve() {
        if (this.segmentTemplates.length === 0) {
            return {
                sheets: [],
                fitness: 0,
                placedCount: 0,
                totalCount: 0,
                usedOrientationCount: 0,
                usedOrientations: [],
                testedVariants: [],
                baseline: null
            };
        }

        this.resetRng(this.randomSeed);
        const baseline = this.buildBaselineSolution();
        const variantCounts = this.getOrientationVariantCounts();

        let best = null;
        const allCandidates = [];
        const testedVariants = [];
        const coarseCandidates = [];

        for (const orientationLimit of variantCounts) {
            const candidate = this.solveVariantSync(orientationLimit, { preciseCollision: false });
            coarseCandidates.push({ orientationLimit, candidate });
            allCandidates.push(candidate);
            testedVariants.push({
                orientationLimit,
                avgUtilization: this.safeAvgUtil(candidate),
                placedCount: candidate.placedCount,
                phase: 'coarse'
            });

            if (!best || this.isSolutionBetter(candidate, best)) best = candidate;
        }

        // Refine only strongest coarse candidate(s)
        const finalists = coarseCandidates
            .sort((a, b) => this.isSolutionBetter(a.candidate, b.candidate) ? -1 : 1)
            .slice(0, this.maxPreciseRefinements);

        for (const finalist of finalists) {
            const refined = this.solveVariantSync(finalist.orientationLimit, { preciseCollision: true });
            allCandidates.push(refined);
            testedVariants.push({
                orientationLimit: finalist.orientationLimit,
                avgUtilization: this.safeAvgUtil(refined),
                placedCount: refined.placedCount,
                phase: 'precise'
            });
            if (!best || this.isSolutionBetter(refined, best)) best = refined;
        }

        best = this.selectBestValidSolution(allCandidates) || best;
        best.baseline = baseline;
        best.testedVariants = testedVariants;
        return best;
    }

    async solveAsync(onProgress = () => {}) {
        if (this.segmentTemplates.length === 0) {
            return {
                sheets: [],
                fitness: 0,
                placedCount: 0,
                totalCount: 0,
                usedOrientationCount: 0,
                usedOrientations: [],
                testedVariants: [],
                baseline: null
            };
        }

        this.resetRng(this.randomSeed);
        const baseline = this.buildBaselineSolution();
        const variantCounts = this.getOrientationVariantCounts();

        let best = null;
        const allCandidates = [];
        const testedVariants = [];
        const coarseCandidates = [];
        let globalPlaced = 0;
        let globalAttempts = 0;

        for (let i = 0; i < variantCounts.length; i++) {
            const orientationLimit = variantCounts[i];
            const isPreviewVariant = i === variantCounts.length - 1;

            let candidate;
            if (isPreviewVariant) {
                candidate = await this.solveVariantAsync(orientationLimit, (update) => {
                    globalPlaced += update.placedDelta;
                    globalAttempts += update.attemptsDelta;
                    onProgress({
                        phase: 'placing',
                        variantIndex: i,
                        variantTotal: variantCounts.length,
                        orientationLimit,
                        sheetIndex: update.sheetIndex,
                        placedCount: globalPlaced,
                        attempts: globalAttempts,
                        preview: update.preview || null
                    });
                }, { preciseCollision: false });
            } else {
                candidate = this.solveVariantSync(orientationLimit, { preciseCollision: false });
            }

            coarseCandidates.push({ orientationLimit, candidate });
            allCandidates.push(candidate);
            testedVariants.push({
                orientationLimit,
                avgUtilization: this.safeAvgUtil(candidate),
                placedCount: candidate.placedCount,
                phase: 'coarse'
            });

            onProgress({
                phase: 'variant-complete',
                variantIndex: i,
                variantTotal: variantCounts.length,
                orientationLimit,
                placedCount: globalPlaced,
                attempts: globalAttempts
            });

            if (!best || this.isSolutionBetter(candidate, best)) best = candidate;
            await this.yieldToMainThread();
        }

        const finalists = coarseCandidates
            .sort((a, b) => this.isSolutionBetter(a.candidate, b.candidate) ? -1 : 1)
            .slice(0, this.maxPreciseRefinements);

        for (let i = 0; i < finalists.length; i++) {
            const finalist = finalists[i];
            onProgress({
                phase: 'refine-start',
                variantIndex: i,
                variantTotal: finalists.length,
                orientationLimit: finalist.orientationLimit,
                placedCount: globalPlaced,
                attempts: globalAttempts
            });

            const refined = this.solveVariantSync(finalist.orientationLimit, { preciseCollision: true });
            allCandidates.push(refined);
            testedVariants.push({
                orientationLimit: finalist.orientationLimit,
                avgUtilization: this.safeAvgUtil(refined),
                placedCount: refined.placedCount,
                phase: 'precise'
            });
            if (!best || this.isSolutionBetter(refined, best)) best = refined;

            onProgress({
                phase: 'refine-complete',
                variantIndex: i,
                variantTotal: finalists.length,
                orientationLimit: finalist.orientationLimit,
                placedCount: globalPlaced,
                attempts: globalAttempts
            });

            await this.yieldToMainThread();
        }

        best = this.selectBestValidSolution(allCandidates) || best;
        best.baseline = baseline;
        best.testedVariants = testedVariants;
        return best;
    }

    selectBestValidSolution(candidates) {
        if (!candidates || candidates.length === 0) return null;
        let bestValid = null;
        let bestAny = null;
        for (const c of candidates) {
            if (!bestAny || this.isSolutionBetter(c, bestAny)) bestAny = c;
            const v = this.validateSolution(c);
            if (!v.valid) continue;
            if (!bestValid || this.isSolutionBetter(c, bestValid)) bestValid = c;
        }
        return bestValid || bestAny;
    }

    solveVariantSync(orientationLimit, options = {}) {
        const preciseCollision = Boolean(options.preciseCollision);
        this.resetRng(this.randomSeed + orientationLimit * 101 + (preciseCollision ? 37 : 0));

        const usedOrientations = new Set();
        const orientationUseCounts = new Map();
        const sheets = [];

        for (let sheetIndex = 0; sheetIndex < this.maxSheets; sheetIndex++) {
            const sheet = this.packSingleSheetSync(orientationLimit, preciseCollision, usedOrientations, orientationUseCounts);
            if (sheet.length === 0) break;
            sheets.push(sheet);
        }

        return this.buildSolutionFromSheets(sheets, orientationLimit, preciseCollision);
    }

    async solveVariantAsync(orientationLimit, onTick = () => {}, options = {}) {
        const preciseCollision = Boolean(options.preciseCollision);
        this.resetRng(this.randomSeed + orientationLimit * 101 + (preciseCollision ? 37 : 0));

        const usedOrientations = new Set();
        const orientationUseCounts = new Map();
        const sheets = [];

        for (let sheetIndex = 0; sheetIndex < this.maxSheets; sheetIndex++) {
            const sheet = await this.packSingleSheetAsync(orientationLimit, preciseCollision, usedOrientations, orientationUseCounts, sheetIndex, onTick);
            if (sheet.length === 0) break;
            sheets.push(sheet);
        }

        return this.buildSolutionFromSheets(sheets, orientationLimit, preciseCollision);
    }

    buildSolutionFromSheets(sheets, orientationLimit, preciseCollision) {
        const usage = this.analyzeOrientationUsageFromSheets(sheets);
        const placedCount = sheets.reduce((sum, s) => sum + s.length, 0);

        return {
            sheets,
            fitness: this.calculateFitness(sheets),
            placedCount,
            totalCount: this.segmentTemplates.length,
            orientationLimitTested: orientationLimit,
            preciseCollision,
            usedOrientationCount: usage.usedOrientations.length,
            usedOrientations: usage.usedOrientations
        };
    }

    analyzeOrientationUsageFromSheets(sheets) {
        const counts = new Map();
        for (const sheet of sheets) {
            for (const p of sheet) {
                const angle = typeof p.angle === 'number' ? p.angle : 0;
                counts.set(angle, (counts.get(angle) || 0) + 1);
            }
        }
        return {
            counts,
            usedOrientations: [...counts.keys()].sort((a, b) => a - b)
        };
    }

    createSheetContext() {
        const ctx = {
            placements: [],
            grid: new Map(),
            anchors: [],
            anchorSet: new Set(),
            sortedAnchorsCache: [],
            anchorsDirty: true
        };

        this.addAnchor(ctx, this.marginLeft, this.marginTop);
        return ctx;
    }

    addAnchor(ctx, x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        const rightLimit = this.paperWidth - this.marginLeft;
        const bottomLimit = this.paperHeight - this.marginTop;

        if (x < this.marginLeft || y < this.marginTop) return;
        if (x > rightLimit || y > bottomLimit) return;

        const key = `${x.toFixed(6)}|${y.toFixed(6)}`;
        if (ctx.anchorSet.has(key)) return;

        ctx.anchorSet.add(key);
        ctx.anchors.push({ x, y });
        ctx.anchorsDirty = true;

        if (ctx.anchors.length > this.maxContactPoints) {
            ctx.anchors.sort((a, b) => (a.y - b.y) || (a.x - b.x));
            const keep = ctx.anchors.slice(0, this.maxContactPoints);
            ctx.anchors = keep;
            ctx.anchorSet = new Set(keep.map(p => `${p.x.toFixed(6)}|${p.y.toFixed(6)}`));
            ctx.anchorsDirty = true;
        }
    }

    getSortedAnchors(ctx) {
        if (!ctx.anchorsDirty) return ctx.sortedAnchorsCache;
        ctx.sortedAnchorsCache = [...ctx.anchors].sort((a, b) => (a.y - b.y) || (a.x - b.x));
        ctx.anchorsDirty = false;
        return ctx.sortedAnchorsCache;
    }

    registerPlacement(ctx, placement) {
        placement._bounds = this.computePlacementBounds(placement);
        placement._absShape = Geometry.translateShape(placement.shape, placement.x, placement.y);
        placement._absPolyCoarse = Geometry.toPolygonPoints(placement._absShape, 12, 20);
        placement._absPolyPrecise = Geometry.toPolygonPoints(placement._absShape, 28, 56);

        ctx.placements.push(placement);
        this.addPlacementToGrid(ctx, placement, ctx.placements.length - 1);

        const b = placement._bounds;
        // Contact anchors without extra gap.
        // Real minimum distance is enforced in collision checks via `padding`.
        this.addAnchor(ctx, b.maxX, b.minY);
        this.addAnchor(ctx, b.minX, b.maxY);
        this.addAnchor(ctx, b.maxX, b.maxY);
        // Explicit row-restart contact anchor.
        this.addAnchor(ctx, this.marginLeft, b.maxY);
    }

    packSingleSheetSync(orientationLimit, preciseCollision, usedOrientations, orientationUseCounts) {
        const ctx = this.createSheetContext();
        let placed = 0;
        const placementLimit = Math.min(this.maxPlacementsPerSheet, this.estimateTheoreticalPlacementLimit());

        while (placed < placementLimit) {
            let next = this.findBestPlacement(ctx, orientationLimit, preciseCollision, usedOrientations, orientationUseCounts);
            if (!next) {
                next = this.findPlacementBySweep(ctx, orientationLimit, preciseCollision, usedOrientations);
            }
            if (!next) break;

            this.registerPlacement(ctx, next.candidate);
            usedOrientations.add(next.candidate.angle);
            orientationUseCounts.set(next.candidate.angle, (orientationUseCounts.get(next.candidate.angle) || 0) + 1);
            placed += 1;
        }

        return ctx.placements;
    }

    async packSingleSheetAsync(orientationLimit, preciseCollision, usedOrientations, orientationUseCounts, sheetIndex, onTick = () => {}) {
        const ctx = this.createSheetContext();
        let placed = 0;
        let attempts = 0;
        const yieldEvery = 8;
        const placementLimit = Math.min(this.maxPlacementsPerSheet, this.estimateTheoreticalPlacementLimit());

        while (placed < placementLimit) {
            let next = this.findBestPlacement(ctx, orientationLimit, preciseCollision, usedOrientations, orientationUseCounts);
            if (!next) {
                next = this.findPlacementBySweep(ctx, orientationLimit, preciseCollision, usedOrientations);
            }
            attempts += next ? next.attempts : 1;

            if (!next) {
                onTick({ placedDelta: 0, attemptsDelta: Math.max(1, attempts), sheetIndex, preview: null });
                break;
            }

            this.registerPlacement(ctx, next.candidate);
            usedOrientations.add(next.candidate.angle);
            orientationUseCounts.set(next.candidate.angle, (orientationUseCounts.get(next.candidate.angle) || 0) + 1);
            placed += 1;

            if (placed % 4 === 0) {
                onTick({
                    placedDelta: 4,
                    attemptsDelta: attempts,
                    sheetIndex,
                    preview: {
                        placements: ctx.placements.slice(),
                        candidate: next.candidate,
                        status: 'placed'
                    }
                });
                attempts = 0;
            }

            if (placed % yieldEvery === 0) {
                await this.yieldToMainThread();
            }
        }

        if (attempts > 0) {
            onTick({ placedDelta: 0, attemptsDelta: attempts, sheetIndex, preview: null });
        }

        return ctx.placements;
    }

    estimateTheoreticalPlacementLimit() {
        const usableW = Math.max(1, this.paperWidth - this.marginLeft * 2);
        const usableH = Math.max(1, this.paperHeight - this.marginTop * 2);
        const usableArea = usableW * usableH;
        let minArea = Infinity;
        for (const t of this.segmentTemplates) {
            minArea = Math.min(minArea, t.area || Infinity);
        }
        if (!Number.isFinite(minArea) || minArea <= 0) {
            return this.maxPlacementsPerSheet;
        }
        const optimistic = Math.floor(usableArea / (minArea * 0.7));
        return Math.max(1, Math.min(this.maxPlacementsPerSheet, optimistic + 20));
    }

    findBestPlacement(ctx, orientationLimit, preciseCollision, usedOrientations, orientationUseCounts) {
        const anchors = this.getSortedAnchors(ctx).slice(0, this.maxAnchorsToProbe);
        if (anchors.length === 0) return null;

        let best = null;
        let attempts = 0;
        const offsets = this.getAnchorShiftOffsets();

        const templateCount = this.segmentTemplates.length;
        const templateOffset = templateCount > 0 ? Math.floor(this.random() * templateCount) : 0;

        for (const anchor of anchors) {
            for (let t = 0; t < templateCount; t++) {
                const template = this.segmentTemplates[(t + templateOffset) % templateCount];
                const rotations = this.buildRotationSubset(template.rotations, orientationLimit);
                const rotOffset = rotations.length > 0 ? Math.floor(this.random() * rotations.length) : 0;

                for (let r = 0; r < rotations.length; r++) {
                    const rot = rotations[(r + rotOffset) % rotations.length];
                    attempts += 1;

                    if (!this.canUseOrientation(rot.angle, usedOrientations, orientationLimit)) {
                        continue;
                    }

                    for (let oi = 0; oi < offsets.length; oi++) {
                        const o = offsets[oi];
                        const candidate = {
                            x: anchor.x + o.dx,
                            y: anchor.y + o.dy,
                            shape: rot.shape,
                            templateId: template.id,
                            angle: rot.angle
                        };
                        candidate._bounds = this.computePlacementBounds(candidate);

                        if (!this.isPlacementInsideSheet(candidate)) continue;
                        if (this.hasCollisionFast(ctx, candidate, this.padding, preciseCollision)) continue;

                        if (!best || this.isCandidateBetter(candidate, best, usedOrientations, orientationUseCounts, orientationLimit)) {
                            best = candidate;
                        }
                    }
                }
            }

            // Bottom-left spirit: if we found a valid point on this y, stop deep probing much earlier.
            if (best && Math.abs(best.y - anchor.y) < 1e-6) {
                break;
            }
        }

        if (!best) return null;
        return { candidate: best, attempts };
    }

    getAnchorShiftOffsets() {
        const p = Math.max(0.5, this.padding);
        const q = p * 0.33;
        return [
            { dx: 0, dy: 0 },
            { dx: q, dy: 0 },
            { dx: 0, dy: q },
            { dx: q, dy: q }
        ];
    }

    findPlacementBySweep(ctx, orientationLimit, preciseCollision, usedOrientations) {
        const rightLimit = this.paperWidth - this.marginLeft;
        const bottomLimit = this.paperHeight - this.marginTop;
        const yLevels = [];
        const anchors = this.getSortedAnchors(ctx);

        for (let i = 0; i < anchors.length && yLevels.length < 12; i++) {
            const y = anchors[i].y;
            if (y < this.marginTop || y > bottomLimit) continue;
            if (yLevels.length === 0 || Math.abs(yLevels[yLevels.length - 1] - y) > 0.75) {
                yLevels.push(y);
            }
        }

        if (yLevels.length === 0) return null;

        const templateCount = this.segmentTemplates.length;
        const templateOffset = templateCount > 0 ? Math.floor(this.random() * templateCount) : 0;

        for (let t = 0; t < templateCount && t < 2; t++) {
            const template = this.segmentTemplates[(t + templateOffset) % templateCount];
            const rotations = this.buildRotationSubset(template.rotations, orientationLimit);

            for (let ri = 0; ri < rotations.length && ri < 3; ri++) {
                const rot = rotations[ri];
                if (!this.canUseOrientation(rot.angle, usedOrientations, orientationLimit)) continue;
                const b = Geometry.getShapeBounds(rot.shape);
                const stepX = Math.max(0.8, Math.min(8, Math.max(1.2, b.width * 0.22)));

                for (const y of yLevels) {
                    if (y + b.maxY > bottomLimit + 1e-6) continue;

                    let probes = 0;
                    for (let x = this.marginLeft; x + b.maxX <= rightLimit + 1e-6; x += stepX) {
                        probes += 1;
                        if (probes > 60) break;

                        const candidate = {
                            x,
                            y,
                            shape: rot.shape,
                            templateId: template.id,
                            angle: rot.angle
                        };
                        candidate._bounds = this.computePlacementBounds(candidate);

                        if (!this.isPlacementInsideSheet(candidate)) continue;
                        if (this.hasCollisionFast(ctx, candidate, this.padding, preciseCollision)) continue;
                        return { candidate, attempts: probes };
                    }
                }
            }
        }

        return null;
    }

    canUseOrientation(angle, usedOrientations, orientationLimit) {
        if (usedOrientations.has(angle)) return true;
        return usedOrientations.size < orientationLimit;
    }

    isCandidateBetter(candidate, best, usedOrientations, orientationUseCounts, orientationLimit) {
        if (candidate.y !== best.y) return candidate.y < best.y;
        if (candidate.x !== best.x) return candidate.x < best.x;

        const cb = candidate._bounds || this.computePlacementBounds(candidate);
        const bb = best._bounds || this.computePlacementBounds(best);

        if (Math.abs(cb.height - bb.height) > 1e-6) return cb.height < bb.height;
        if (Math.abs(cb.width - bb.width) > 1e-6) return cb.width < bb.width;

        const cNew = !usedOrientations.has(candidate.angle) && usedOrientations.size < orientationLimit;
        const bNew = !usedOrientations.has(best.angle) && usedOrientations.size < orientationLimit;
        if (cNew !== bNew) return cNew;

        const cCount = orientationUseCounts.get(candidate.angle) || 0;
        const bCount = orientationUseCounts.get(best.angle) || 0;
        if (cCount !== bCount) return cCount < bCount;

        return false;
    }

    computePlacementBounds(placement) {
        if (placement._bounds) return placement._bounds;
        const shapeBounds = Geometry.getShapeBounds(placement.shape);
        return {
            minX: placement.x + shapeBounds.minX,
            minY: placement.y + shapeBounds.minY,
            maxX: placement.x + shapeBounds.maxX,
            maxY: placement.y + shapeBounds.maxY,
            width: shapeBounds.width,
            height: shapeBounds.height
        };
    }

    isPlacementInsideSheet(placement) {
        const b = this.computePlacementBounds(placement);
        const rightLimit = this.paperWidth - this.marginLeft;
        const bottomLimit = this.paperHeight - this.marginTop;

        return (
            b.minX >= this.marginLeft &&
            b.minY >= this.marginTop &&
            b.maxX <= rightLimit &&
            b.maxY <= bottomLimit
        );
    }

    addPlacementToGrid(ctx, placement, placementIndex) {
        const bounds = this.computePlacementBounds(placement);
        const cells = this.getGridCellsForBounds(bounds, 0);

        for (const cellKey of cells) {
            if (!ctx.grid.has(cellKey)) {
                ctx.grid.set(cellKey, []);
            }
            ctx.grid.get(cellKey).push(placementIndex);
        }
    }

    getGridCellsForBounds(bounds, expand = 0) {
        const minX = bounds.minX - expand;
        const minY = bounds.minY - expand;
        const maxX = bounds.maxX + expand;
        const maxY = bounds.maxY + expand;

        const minCellX = Math.floor(minX / this.spatialCellSize);
        const maxCellX = Math.floor(maxX / this.spatialCellSize);
        const minCellY = Math.floor(minY / this.spatialCellSize);
        const maxCellY = Math.floor(maxY / this.spatialCellSize);

        const cells = [];
        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
                cells.push(`${cx},${cy}`);
            }
        }

        return cells;
    }

    hasCollisionFast(ctx, candidate, padding, preciseCollision = false) {
        const a = this.computePlacementBounds(candidate);
        const nearbyCells = this.getGridCellsForBounds(a, padding);
        const indices = new Set();
        const eps = 1e-6;

        const candidateShapeAbs = Geometry.translateShape(candidate.shape, candidate.x, candidate.y);
        const candidatePoly = preciseCollision
            ? Geometry.toPolygonPoints(candidateShapeAbs, 28, 56)
            : Geometry.toPolygonPoints(candidateShapeAbs, 12, 20);

        for (const key of nearbyCells) {
            const bucket = ctx.grid.get(key);
            if (!bucket) continue;
            for (const idx of bucket) indices.add(idx);
        }

        for (const idx of indices) {
            const placement = ctx.placements[idx];
            const b = this.computePlacementBounds(placement);

            const separated = (
                a.maxX + padding <= b.minX + eps ||
                a.minX >= b.maxX + padding - eps ||
                a.maxY + padding <= b.minY + eps ||
                a.minY >= b.maxY + padding - eps
            );
            if (separated) continue;

            if (!preciseCollision) {
                const placedPoly = placement._absPolyCoarse
                    || Geometry.toPolygonPoints(placement._absShape || Geometry.translateShape(placement.shape, placement.x, placement.y), 12, 20);
                if (Geometry.polygonsIntersect(candidatePoly, placedPoly)) return true;
                continue;
            }

            const placedPoly = placement._absPolyPrecise
                || Geometry.toPolygonPoints(placement._absShape || Geometry.translateShape(placement.shape, placement.x, placement.y), 28, 56);
            if (Geometry.polygonDistance(candidatePoly, placedPoly) < padding - 1e-6) return true;
        }

        return false;
    }

    async yieldToMainThread() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    safeAvgUtil(solution) {
        if (!solution.sheets || solution.sheets.length === 0) return 0;
        const totalArea = this.paperWidth * this.paperHeight * solution.sheets.length;
        const usedArea = solution.sheets.reduce((sum, sheet) => {
            return sum + sheet.reduce((sub, p) => sub + Geometry.calculateArea(p.shape), 0);
        }, 0);
        return totalArea > 0 ? usedArea / totalArea : 0;
    }

    buildBaselineSolution() {
        const sheets = [];
        if (this.segmentTemplates.length === 0) {
            return {
                sheets,
                fitness: 0,
                placedCount: 0,
                totalCount: 0,
                orientationLimitTested: 1,
                preciseCollision: false,
                usedOrientationCount: 0,
                usedOrientations: []
            };
        }

        const template = this.segmentTemplates[0];
        const rotation0 = (template.rotations || []).find(r => Math.abs(r.angle) < 1e-9) || template.rotations?.[0];
        if (!rotation0) {
            return {
                sheets,
                fitness: 0,
                placedCount: 0,
                totalCount: this.segmentTemplates.length,
                orientationLimitTested: 1,
                preciseCollision: false,
                usedOrientationCount: 0,
                usedOrientations: []
            };
        }

        const shape = rotation0.shape;
        const b = Geometry.getShapeBounds(shape);
        const rightLimit = this.paperWidth - this.marginLeft;
        const bottomLimit = this.paperHeight - this.marginTop;
        const stepX = Math.max(1, b.width + this.padding);
        const stepY = Math.max(1, b.height + this.padding);
        const maxX = rightLimit - b.maxX;
        const maxY = bottomLimit - b.maxY;

        for (let sheetIndex = 0; sheetIndex < this.maxSheets; sheetIndex++) {
            const placements = [];
            for (let y = this.marginTop; y <= maxY + 1e-9; y += stepY) {
                for (let x = this.marginLeft; x <= maxX + 1e-9; x += stepX) {
                    placements.push({ x, y, shape, templateId: template.id, angle: 0 });
                }
            }
            if (placements.length === 0) break;
            sheets.push(placements);
        }

        const placedCount = sheets.reduce((sum, s) => sum + s.length, 0);
        return {
            sheets,
            fitness: this.calculateFitness(sheets),
            placedCount,
            totalCount: this.segmentTemplates.length,
            orientationLimitTested: 1,
            preciseCollision: false,
            usedOrientationCount: placedCount > 0 ? 1 : 0,
            usedOrientations: placedCount > 0 ? [0] : []
        };
    }

    getProductionScoreDelta(solution, baseline) {
        if (!baseline) return 0;
        const utilSolution = this.safeAvgUtil(solution) * 100;
        const utilBaseline = this.safeAvgUtil(baseline) * 100;
        return utilSolution - utilBaseline;
    }

    calculatePatternSwitches(sheets) {
        let switches = 0;
        for (const sheet of sheets) {
            const ordered = [...sheet].sort((a, b) => {
                if (Math.abs(a.y - b.y) > this.padding * 0.6) return a.y - b.y;
                return a.x - b.x;
            });
            for (let i = 1; i < ordered.length; i++) {
                const prev = ordered[i - 1];
                const curr = ordered[i];
                if (Math.abs(prev.y - curr.y) <= this.padding * 0.9 && Math.abs((prev.angle || 0) - (curr.angle || 0)) > 0.1) {
                    switches += 1;
                }
            }
        }
        return switches;
    }

    calculateSolutionScore(solution) {
        if (!solution || !solution.sheets) return -Infinity;
        const utilPercent = this.safeAvgUtil(solution) * 100;
        const parts = solution.placedCount || 0;
        const angleCount = solution.usedOrientationCount || (solution.usedOrientations ? solution.usedOrientations.length : 0);
        // Primary objective: maximize utilization (minimize unused area).
        // Secondary objective: part count and simpler orientation usage.
        return utilPercent * 1000 + parts * 0.1 - angleCount * 0.01;
    }

    isSolutionBetter(a, b) {
        const utilA = this.safeAvgUtil(a);
        const utilB = this.safeAvgUtil(b);
        const utilGap = Math.abs(utilA - utilB);
        if (utilGap > this.solutionUtilTieEpsilon) return utilA > utilB;
        if (a.placedCount !== b.placedCount) return a.placedCount > b.placedCount;
        if (a.usedOrientationCount !== b.usedOrientationCount) return a.usedOrientationCount < b.usedOrientationCount;
        return this.calculateFitness(a.sheets) > this.calculateFitness(b.sheets);
    }

    calculateFitness(sheets) {
        if (sheets.length === 0) return 0;
        const totalPlaced = sheets.reduce((sum, s) => sum + s.length, 0);
        const usedArea = sheets.reduce((sum, sheet) => sum + sheet.reduce((sub, p) => sub + Geometry.calculateArea(p.shape), 0), 0);
        const totalArea = this.paperWidth * this.paperHeight * sheets.length;
        const utilization = totalArea > 0 ? usedArea / totalArea : 0;
        const usage = this.analyzeOrientationUsageFromSheets(sheets);
        const patternSwitches = this.calculatePatternSwitches(sheets);
        const anglePenalty = usage.usedOrientations.length * 2.4;
        const patternPenalty = patternSwitches * 0.18;
        return (totalPlaced + utilization * 65) - anglePenalty - patternPenalty;
    }

    countSheetCollisions(sheet) {
        let collisions = 0;
        for (let i = 0; i < sheet.length; i++) {
            const a = sheet[i];
            const aAbs = Geometry.translateShape(a.shape, a.x, a.y);
            const aBounds = Geometry.getShapeBounds(aAbs);
            const aPoly = Geometry.toPolygonPoints(aAbs, 20, 40);

            for (let j = i + 1; j < sheet.length; j++) {
                const b = sheet[j];
                const bAbs = Geometry.translateShape(b.shape, b.x, b.y);
                const bBounds = Geometry.getShapeBounds(bAbs);
                const separated = (
                    aBounds.maxX + this.padding <= bBounds.minX ||
                    aBounds.minX >= bBounds.maxX + this.padding ||
                    aBounds.maxY + this.padding <= bBounds.minY ||
                    aBounds.minY >= bBounds.maxY + this.padding
                );
                if (separated) continue;
                const bPoly = Geometry.toPolygonPoints(bAbs, 20, 40);
                if (Geometry.polygonDistance(aPoly, bPoly) < this.padding - 1e-6) collisions += 1;
            }
        }
        return collisions;
    }

    computeMinimumDistances(solution) {
        let minSegmentGap = Infinity;
        let minEdgeGapX = Infinity;
        let minEdgeGapY = Infinity;

        for (const sheet of (solution.sheets || [])) {
            for (let i = 0; i < sheet.length; i++) {
                const a = sheet[i];
                const aAbs = Geometry.translateShape(a.shape, a.x, a.y);
                const aBounds = Geometry.getShapeBounds(aAbs);
                const aPoly = Geometry.toPolygonPoints(aAbs, 20, 40);

                const edgeLeft = aBounds.minX;
                const edgeRight = this.paperWidth - aBounds.maxX;
                const edgeTop = aBounds.minY;
                const edgeBottom = this.paperHeight - aBounds.maxY;
                minEdgeGapX = Math.min(minEdgeGapX, edgeLeft, edgeRight);
                minEdgeGapY = Math.min(minEdgeGapY, edgeTop, edgeBottom);

                for (let j = i + 1; j < sheet.length; j++) {
                    const b = sheet[j];
                    const bAbs = Geometry.translateShape(b.shape, b.x, b.y);
                    const bPoly = Geometry.toPolygonPoints(bAbs, 20, 40);
                    const dist = Geometry.polygonDistance(aPoly, bPoly);
                    minSegmentGap = Math.min(minSegmentGap, dist);
                }
            }
        }

        return {
            minSegmentGap: Number.isFinite(minSegmentGap) ? minSegmentGap : 0,
            minEdgeGapX: Number.isFinite(minEdgeGapX) ? minEdgeGapX : 0,
            minEdgeGapY: Number.isFinite(minEdgeGapY) ? minEdgeGapY : 0
        };
    }

    validateSolution(solution) {
        const issues = [];
        let outOfBounds = 0;
        let collisions = 0;
        const clearance = this.computeMinimumDistances(solution);

        for (const sheet of (solution.sheets || [])) {
            for (const p of sheet) {
                if (!this.isPlacementInsideSheet(p)) outOfBounds += 1;
            }
            collisions += this.countSheetCollisions(sheet);
        }

        if (outOfBounds > 0) issues.push(`${outOfBounds} placements out of bounds`);
        if (collisions > 0) issues.push(`${collisions} overlap pairs detected`);

        const usedCount = solution.usedOrientationCount || (solution.usedOrientations ? solution.usedOrientations.length : 0);
        if (solution.orientationLimitTested && usedCount > solution.orientationLimitTested) {
            issues.push(`orientation limit violated (${usedCount} > ${solution.orientationLimitTested})`);
        }

        const totalArea = this.paperWidth * this.paperHeight * Math.max(1, solution.sheets.length);
        const usedArea = (solution.sheets || []).reduce((sum, sheet) => sum + sheet.reduce((s, p) => s + Geometry.calculateArea(p.shape), 0), 0);
        const util = totalArea > 0 ? usedArea / totalArea : 0;
        if (util < 0 || util > 1.00001) issues.push(`utilization out of range (${(util * 100).toFixed(2)}%)`);

        if (clearance.minSegmentGap + 1e-6 < this.padding) {
            issues.push(`segment gap below minimum (${clearance.minSegmentGap.toFixed(2)} < ${this.padding.toFixed(2)} mm)`);
        }
        if (clearance.minEdgeGapX + 1e-6 < this.marginLeft) {
            issues.push(`edge gap X below minimum (${clearance.minEdgeGapX.toFixed(2)} < ${this.marginLeft.toFixed(2)} mm)`);
        }
        if (clearance.minEdgeGapY + 1e-6 < this.marginTop) {
            issues.push(`edge gap Y below minimum (${clearance.minEdgeGapY.toFixed(2)} < ${this.marginTop.toFixed(2)} mm)`);
        }

        return {
            valid: issues.length === 0,
            issues,
            outOfBounds,
            collisions,
            clearance
        };
    }

    getStatistics(solution) {
        let totalArea = 0;
        const sheetData = [];

        for (let i = 0; i < solution.sheets.length; i++) {
            const sheet = solution.sheets[i];
            const sheetArea = sheet.reduce((sum, p) => sum + Geometry.calculateArea(p.shape), 0);
            totalArea += sheetArea;
            sheetData.push({
                sheetNumber: i + 1,
                segments: sheet.length,
                utilizationPercent: ((sheetArea / (this.paperWidth * this.paperHeight)) * 100).toFixed(1)
            });
        }

        const totalSheets = solution.sheets.length;
        const totalSegments = solution.placedCount;

        const baseline = solution.baseline || null;
        const baselineSheetData = [];
        if (baseline && baseline.sheets) {
            for (let i = 0; i < baseline.sheets.length; i++) {
                const sheet = baseline.sheets[i];
                const area = sheet.reduce((sum, p) => sum + Geometry.calculateArea(p.shape), 0);
                baselineSheetData.push({
                    sheetNumber: i + 1,
                    segments: sheet.length,
                    utilizationPercent: ((area / (this.paperWidth * this.paperHeight)) * 100).toFixed(1)
                });
            }
        }

        const baselinePlaced = baseline ? baseline.placedCount : 0;
        const baselineUtil = baseline ? this.safeAvgUtil(baseline) : 0;
        const baselinePatternSwitches = baseline ? this.calculatePatternSwitches(baseline.sheets || []) : 0;
        const optUtil = this.safeAvgUtil(solution);

        const utilizationGainPoints = (optUtil - baselineUtil) * 100;
        const segmentGain = totalSegments - baselinePlaced;
        const extraOrientations = Math.max(0, (solution.usedOrientationCount || 0) - (baseline?.usedOrientationCount || 0));
        const complexityPenaltyPoints = extraOrientations * 2.5;
        const netProductionScore = this.getProductionScoreDelta(solution, baseline);
        const patternSwitches = this.calculatePatternSwitches(solution.sheets || []);
        const sanity = this.validateSolution(solution);
        const totalSheetArea = this.paperWidth * this.paperHeight * Math.max(1, totalSheets);
        const unusedArea = Math.max(0, totalSheetArea - totalArea);
        const unusedPercent = totalSheetArea > 0 ? (unusedArea / totalSheetArea) * 100 : 0;
        const baselineTotalArea = baseline && baseline.sheets
            ? baseline.sheets.reduce((sum, s) => sum + s.reduce((sub, p) => sub + Geometry.calculateArea(p.shape), 0), 0)
            : 0;
        const baselineUnusedArea = Math.max(0, totalSheetArea - baselineTotalArea);
        const baselineUnusedPercent = totalSheetArea > 0 ? (baselineUnusedArea / totalSheetArea) * 100 : 0;

        const relativeGainPercent = baselineUtil > 0
            ? ((optUtil - baselineUtil) / baselineUtil) * 100
            : (optUtil > 0 ? 100 : 0);

        const scoreEpsilon = 0.1;
        const isTie = Math.abs(netProductionScore) <= scoreEpsilon;
        const recommendedMode = netProductionScore > scoreEpsilon
            ? 'optimized'
            : (isTie ? 'tie' : 'baseline');

        return {
            totalSheets,
            totalSegments,
            totalArea: totalArea.toFixed(2),
            avgUtilization: totalSheets > 0
                ? ((totalArea / (this.paperWidth * this.paperHeight * totalSheets)) * 100).toFixed(1)
                : '0.0',
            sheetData,
            baselineSheetData,
            fitness: solution.fitness.toFixed(2),
            usedOrientationCount: solution.usedOrientationCount,
            usedOrientations: solution.usedOrientations,
            testedVariants: solution.testedVariants || [],
            baselineSegments: baselinePlaced,
            baselineUtilization: (baselineUtil * 100).toFixed(1),
            baselineUnusedArea: baselineUnusedArea.toFixed(2),
            baselineUnusedPercent: baselineUnusedPercent.toFixed(1),
            baselineUsedOrientations: baseline ? baseline.usedOrientationCount : 1,
            baselinePatternSwitches,
            segmentGain,
            utilizationGainPoints: utilizationGainPoints.toFixed(1),
            complexityPenaltyPoints: complexityPenaltyPoints.toFixed(1),
            netProductionScore: netProductionScore.toFixed(1),
            patternSwitches,
            unusedArea: unusedArea.toFixed(2),
            unusedPercent: unusedPercent.toFixed(1),
            relativeGainPercent: relativeGainPercent.toFixed(1),
            beatsBaseline: netProductionScore > scoreEpsilon,
            isTie,
            recommendedMode,
            seed: this.randomSeed,
            sanity
        };
    }
}
