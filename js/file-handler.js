/**
 * ファイル操作を管理するクラス
 */
export class FileHandler {
    constructor() {
        this.currentFileHandle = null;
        this.currentFileName = '';
    }

    /**
     * Excelファイルを読み込み・解析
     * @param {File} file - Excelファイル
     * @returns {Promise<Object>} Excel データ
     */
    async loadExcelFile(file) {
        if (!this.isExcelFile(file)) {
            throw new Error('Excelファイル(.xlsx)を選択してください');
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Excelファイルの読み込みに失敗しました: ' + error.message));
                }
            };
            
            reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 現在のファイル名を取得
     * @returns {string} ファイル名
     */
    getCurrentFileName() {
        return this.currentFileName;
    }

    /**
     * Excelファイルかどうかを判定
     * @param {File} file - ファイル
     * @returns {boolean} Excelファイルかどうか
     */
    isExcelFile(file) {
        return file.name.toLowerCase().endsWith('.xlsx') && 
               file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

}