/**
 * バリデーション機能を提供するクラス
 */
export class Validators {
    /**
     * ポイントIDが「X-nn」形式（英大文字1桁-数字2桁）かどうかをチェック
     * @param {string} value - 検証する値
     * @returns {boolean} 有効な形式かどうか
     */
    static isValidPointIdFormat(value) {
        if (!value || value.trim() === '') {
            return true;
        }
        
        const validPattern = /^[A-Z]-\d{2}$/;
        return validPattern.test(value);
    }

    /**
     * ポイントIDを「X-nn」形式に自動修正する
     * @param {string} value - 修正する値
     * @returns {string} 修正された値
     */
    static formatPointId(value) {
        if (!value || typeof value !== 'string') {
            return value;
        }
        
        const original = value.trim();
        if (original === '') {
            return value;
        }
        
        // 1. 全角文字を半角に変換（英文字は大文字化）
        let converted = this.convertFullWidthToHalfWidth(original);
        
        // 2. スペースを全角・半角とも削除
        converted = converted.replace(/[\s　]/g, '');
        
        if (converted === '') {
            return original;
        }
        
        // 3. 末尾が1桁の数字の場合のみ、左をゼロで埋める（例："1"→"01"）
        // 最後の2文字が数字の場合は0パディングしない
        const lastTwoDigitsPattern = /\d{2}$/;
        const singleDigitEndPattern = /^(.*)(\d)$/;
        const singleDigitEndMatch = converted.match(singleDigitEndPattern);
        
        if (singleDigitEndMatch && !singleDigitEndMatch[1].endsWith('-') && !lastTwoDigitsPattern.test(converted)) {
            // ハイフンの直後でなく、最後の2文字が数字でない場合のみパディング
            const prefix = singleDigitEndMatch[1];
            const digit = singleDigitEndMatch[2];
            converted = `${prefix}${digit.padStart(2, '0')}`;
        }
        
        // 4. 末尾が2桁以内の数字で、全体が3文字までの場合、数字の前に"-"を付ける
        if (converted.length <= 3 && !converted.includes('-')) {
            const shortPattern = /^([A-Z]+)(\d{1,2})$/;
            const shortMatch = converted.match(shortPattern);
            
            if (shortMatch) {
                const letters = shortMatch[1];
                const numbers = shortMatch[2];
                return `${letters}-${numbers}`;
            }
        }
        
        return converted;
    }
    
    /**
     * 全角英文字と全角数字、全角ハイフンを半角に変換する（英文字は大文字化）
     * @param {string} str - 変換する文字列
     * @returns {string} 変換後の文字列
     */
    static convertFullWidthToHalfWidth(str) {
        return str.replace(/[Ａ-Ｚａ-ｚ０-９－−‐―]/g, function(char) {
            if (char >= 'Ａ' && char <= 'Ｚ') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char >= 'ａ' && char <= 'ｚ') {
                const halfWidthChar = String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
                return halfWidthChar.toUpperCase();
            }
            if (char >= '０' && char <= '９') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char === '－' || char === '−' || char === '‐' || char === '―') {
                return '-';
            }
            return char;
        }).replace(/[a-z]/g, function(char) {
            // 半角小文字も大文字に変換
            return char.toUpperCase();
        });
    }

    /**
     * ファイルがPNG形式かどうかをチェック
     * @param {File} file - チェックするファイル
     * @returns {boolean} PNG形式かどうか
     */
    static isPngFile(file) {
        return file && file.type.includes('png');
    }

    /**
     * ファイルがJSON形式かどうかをチェック
     * @param {File} file - チェックするファイル
     * @returns {boolean} JSON形式かどうか
     */
    static isJsonFile(file) {
        return file && file.type.includes('json');
    }

    /**
     * JSONデータがポイント形式として有効かどうかをチェック
     * @param {Object} data - チェックするJSONデータ
     * @returns {boolean} 有効なポイントデータかどうか
     */
    static isValidPointData(data) {
        return data && data.points && Array.isArray(data.points);
    }

    /**
     * JSONデータがルート形式として有効かどうかをチェック
     * @param {Object} data - チェックするJSONデータ
     * @returns {boolean} 有効なルートデータかどうか
     */
    static isValidRouteData(data) {
        return data && data.points && Array.isArray(data.points) && data.routeInfo;
    }
}