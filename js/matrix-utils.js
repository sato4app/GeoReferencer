// 行列計算ユーティリティモジュール
// ジオリファレンシングの最小二乗法計算で使用
import { Logger } from './utils.js';

export class MatrixUtils {
    constructor() {
        this.logger = new Logger('MatrixUtils');
    }

    // 行列の転置
    transpose(matrix) {
        if (!matrix || !matrix.length || !matrix[0]) {
            this.logger.error('不正な行列です');
            return null;
        }
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    }

    // 行列の掛け算
    multiply(a, b) {
        if (!a || !b || !a.length || !b.length || a[0].length !== b.length) {
            this.logger.error('行列の次元が不適切です');
            return null;
        }

        const result = new Array(a.length).fill(0).map(() => new Array(b[0].length).fill(0));
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < b[0].length; j++) {
                for (let k = 0; k < b.length; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }

    // 行列とベクトルの掛け算
    multiplyVector(matrix, vector) {
        if (!matrix || !vector || matrix[0].length !== vector.length) {
            this.logger.error('行列とベクトルの次元が不適切です');
            return null;
        }
        return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
    }

    // ガウス・ジョーダン法で連立方程式を解く
    gaussJordan(A, B) {
        try {
            if (!A || !B || A.length !== B.length) {
                this.logger.error('係数行列と定数ベクトルの次元が不一致です');
                return null;
            }

            const n = A.length;
            // 拡大係数行列を作成
            const augmented = A.map((row, i) => [...row, B[i]]);

            // 前進消去
            for (let i = 0; i < n; i++) {
                // ピボット選択（部分ピボット法）
                let maxRow = i;
                for (let k = i + 1; k < n; k++) {
                    if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                        maxRow = k;
                    }
                }
                
                // 行の交換
                if (maxRow !== i) {
                    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
                }

                // 対角要素が0の場合は特異行列
                if (Math.abs(augmented[i][i]) < 1e-10) {
                    this.logger.warn('特異行列のため解けません');
                    return null;
                }

                // 正規化（対角要素を1にする）
                const pivot = augmented[i][i];
                for (let j = i; j <= n; j++) {
                    augmented[i][j] /= pivot;
                }

                // 他の行を消去
                for (let k = 0; k < n; k++) {
                    if (k !== i) {
                        const factor = augmented[k][i];
                        for (let j = i; j <= n; j++) {
                            augmented[k][j] -= factor * augmented[i][j];
                        }
                    }
                }
            }

            // 解を取り出す
            return augmented.map(row => row[n]);

        } catch (error) {
            this.logger.error('ガウス・ジョーダン法エラー', error);
            return null;
        }
    }

    // 最小二乗法でアフィン変換パラメータを計算
    calculateAffineTransformation(controlPoints, coordinateTransforms) {
        try {
            const n = controlPoints.length;
            
            // 連立方程式の係数行列を構築
            // アフィン変換: X = a*x + b*y + c, Y = d*x + e*y + f
            const A = new Array(2 * n).fill(0).map(() => new Array(6).fill(0));
            const B = new Array(2 * n).fill(0);

            for (let i = 0; i < n; i++) {
                const imageX = controlPoints[i].pointJson.imageX;
                const imageY = controlPoints[i].pointJson.imageY;
                const gpsX = coordinateTransforms.lonToWebMercatorX(controlPoints[i].gpsPoint.lng);
                const gpsY = coordinateTransforms.latToWebMercatorY(controlPoints[i].gpsPoint.lat);

                // X座標の方程式
                A[i * 2][0] = imageX;     // a
                A[i * 2][1] = imageY;     // b  
                A[i * 2][2] = 1;          // c
                A[i * 2][3] = 0;
                A[i * 2][4] = 0;
                A[i * 2][5] = 0;
                B[i * 2] = gpsX;

                // Y座標の方程式
                A[i * 2 + 1][0] = 0;
                A[i * 2 + 1][1] = 0;
                A[i * 2 + 1][2] = 0;
                A[i * 2 + 1][3] = imageX;  // d
                A[i * 2 + 1][4] = imageY;  // e
                A[i * 2 + 1][5] = 1;       // f
                B[i * 2 + 1] = gpsY;
            }

            // 正規方程式 (A^T * A) * x = A^T * B を解く
            const At = this.transpose(A);
            const AtA = this.multiply(At, A);
            const AtB = this.multiplyVector(At, B);
            
            // ガウス・ジョーダン法で連立方程式を解く
            const params = this.gaussJordan(AtA, AtB);
            
            if (!params) {
                return null;
            }

            return {
                a: params[0], b: params[1], c: params[2],
                d: params[3], e: params[4], f: params[5]
            };

        } catch (error) {
            this.logger.error('アフィン変換パラメータ計算エラー', error);
            return null;
        }
    }

    // 変換精度を計算
    calculateTransformationAccuracy(controlPoints, transformation, coordinateTransforms) {
        try {
            const errors = [];
            
            for (const point of controlPoints) {
                const imageX = point.pointJson.imageX;
                const imageY = point.pointJson.imageY;
                
                // 変換後座標を計算
                const transformedX = transformation.a * imageX + transformation.b * imageY + transformation.c;
                const transformedY = transformation.d * imageX + transformation.e * imageY + transformation.f;
                
                // 実際のGPS座標（Web Mercator）
                const actualX = coordinateTransforms.lonToWebMercatorX(point.gpsPoint.lng);
                const actualY = coordinateTransforms.latToWebMercatorY(point.gpsPoint.lat);
                
                // 誤差計算（メートル単位）
                const errorDistance = Math.sqrt(
                    Math.pow(transformedX - actualX, 2) + 
                    Math.pow(transformedY - actualY, 2)
                );
                
                errors.push(errorDistance);
            }
            
            const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
            const maxError = Math.max(...errors);
            const minError = Math.min(...errors);
            
            return {
                meanError,
                maxError,
                minError,
                errors
            };
            
        } catch (error) {
            this.logger.error('精度計算エラー', error);
            return { meanError: 0, maxError: 0, minError: 0, errors: [] };
        }
    }
}

// シングルトンインスタンスをエクスポート
export const matrixUtils = new MatrixUtils();