/**
 * 統合ファイル操作を管理するクラス - 読み込み・出力機能統合
 */
import { CONFIG } from './constants.js';

export class FileHandler {
    constructor() {
        this.currentFileHandle = null;
        this.currentFileName = '';
        this.lastUsedDirectory = null;
    }

    /**
     * ファイルハンドルを設定（後でそのフォルダに保存するため）
     * @param {FileSystemFileHandle} fileHandle - ファイルハンドル
     */
    setCurrentFileHandle(fileHandle) {
        this.currentFileHandle = fileHandle;
        this.currentFileName = fileHandle.name;
    }

    /**
     * 現在のファイル名を取得
     * @returns {string} ファイル名
     */
    getCurrentFileName() {
        return this.currentFileName;
    }
    
    /**
     * 現在の日付をyyyymmdd形式で取得
     * @returns {string} yyyymmdd形式の日付
     */
    getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
    
    /**
     * デフォルトファイル名を生成
     * @returns {string} georeferenced-yyyymmdd
     */
    getDefaultGeoJsonFileName() {
        return `georeferenced-${this.getTodayString()}`;
    }

    /**
     * GeoJSONデータをファイルとしてダウンロード（従来方式）
     * @param {Object} geoJsonData - GeoJSONデータ
     * @param {string} filename - ファイル名
     */
    downloadGeoJson(geoJsonData, filename) {
        try {
            const dataStr = JSON.stringify(geoJsonData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = filename.endsWith('.geojson') ? filename : filename + '.geojson';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // メモリリークを防ぐためURLを解放
            URL.revokeObjectURL(link.href);
            
        } catch (error) {
            throw new Error('GeoJSONダウンロードエラー: ' + error.message);
        }
    }

    /**
     * ユーザーが場所を指定してGeoJSONファイルを保存
     * @param {Object} geoJsonData - GeoJSONデータ
     * @param {string} defaultFilename - デフォルトファイル名
     * @returns {Promise<{success: boolean, filename?: string, error?: string}>} 保存結果
     */
    async saveGeoJsonWithUserChoice(geoJsonData, defaultFilename) {
        const dataStr = JSON.stringify(geoJsonData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        
        try {
            // File System Access APIが利用可能かチェック
            if ('showSaveFilePicker' in window) {
                let savePickerOptions = {
                    suggestedName: defaultFilename.endsWith('.geojson') ? defaultFilename : defaultFilename + '.geojson',
                    types: [{
                        description: 'GeoJSON Files',
                        accept: {
                            'application/json': ['.geojson', '.json']
                        }
                    }]
                };
                
                // 前回ファイルを読み込んだフォルダから開始
                if (this.currentFileHandle) {
                    try {
                        const parentDirectoryHandle = await this.currentFileHandle.getParent();
                        savePickerOptions.startIn = parentDirectoryHandle;
                        this.lastUsedDirectory = parentDirectoryHandle;
                    } catch (error) {
                        // 同じディレクトリの取得に失敗した場合
                        if (this.lastUsedDirectory) {
                            savePickerOptions.startIn = this.lastUsedDirectory;
                        }
                    }
                } else if (this.lastUsedDirectory) {
                    savePickerOptions.startIn = this.lastUsedDirectory;
                }
                
                const fileHandle = await window.showSaveFilePicker(savePickerOptions);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                // 成功時にディレクトリを記録
                try {
                    this.lastUsedDirectory = await fileHandle.getParent();
                } catch (error) {
                    // ディレクトリ取得に失敗しても処理続行
                }
                
                return { success: true, filename: fileHandle.name };
            } else {
                // File System Access APIが使用できない場合は従来のダウンロード方式
                this.downloadGeoJson(geoJsonData, defaultFilename);
                return { success: true, filename: defaultFilename };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'キャンセル' };
            }
            
            // エラー時は従来のダウンロード方式にフォールバック
            try {
                this.downloadGeoJson(geoJsonData, defaultFilename);
                return { success: true, filename: defaultFilename };
            } catch (downloadError) {
                return { success: false, error: error.message };
            }
        }
    }

    /**
     * ディレクトリハンドルを設定
     * @param {FileSystemDirectoryHandle} directoryHandle - ディレクトリハンドル
     */
    setLastUsedDirectory(directoryHandle) {
        this.lastUsedDirectory = directoryHandle;
    }

    /**
     * File System Access APIがサポートされているかチェック
     * @returns {boolean} サポート状況
     */
    isFileSystemAccessSupported() {
        return 'showSaveFilePicker' in window;
    }

    // ==========================================
    // ファイル読み込み統合機能
    // ==========================================

    /**
     * 統合ファイル読み込みメソッド
     * @param {File} file - 読み込みファイル
     * @param {string} fileType - ファイル種別 ('json', 'excel', 'image')
     * @returns {Promise} 読み込み結果
     */
    async loadFile(file, fileType) {
        try {
            switch (fileType) {
                case 'json':
                    return await this.loadJsonFile(file);
                case 'excel':
                    return await this.loadExcelFile(file);
                case 'image':
                    return await this.loadImageFile(file);
                default:
                    throw new Error(`未対応のファイル種別: ${fileType}`);
            }
        } catch (error) {
            throw new Error(`ファイル読み込みエラー (${fileType}): ${error.message}`);
        }
    }

    /**
     * JSONファイル読み込み
     */
    async loadJsonFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('JSONファイルの解析に失敗しました: ' + error.message));
                }
            };

            reader.onerror = () => reject(new Error('JSONファイル読み込みエラー'));
            reader.readAsText(file);
        });
    }

    /**
     * Excelファイル読み込み
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

                    // 読み込み行数を制限
                    const range = worksheet['!ref'];
                    if (range) {
                        const decoded = XLSX.utils.decode_range(range);
                        const originalRows = decoded.e.r + 1; // 1ベースの行数

                        // データ行数を制限（設定値から1を引いて0ベースインデックスに調整）
                        const maxRows = CONFIG.MAX_EXCEL_ROWS - 1;
                        if (decoded.e.r > maxRows) {
                            decoded.e.r = maxRows;
                            worksheet['!ref'] = XLSX.utils.encode_range(decoded);
                        }
                    }

                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Excelファイルの読み込みに失敗しました: ' + error.message));
                }
            };

            reader.onerror = () => reject(new Error('Excelファイル読み込みエラー'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 画像ファイル読み込み
     */
    async loadImageFile(file) {
        if (!this.isPngFile(file)) {
            throw new Error('PNG形式の画像ファイルを選択してください');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        dataUrl: e.target.result,
                        image: img,
                        width: img.naturalWidth || img.width,
                        height: img.naturalHeight || img.height
                    });
                };
                img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error('画像ファイル読み込みエラー'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * ファイル種別判定
     */
    isExcelFile(file) {
        return file.name.toLowerCase().endsWith('.xlsx') &&
               file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    isPngFile(file) {
        return file && file.type.includes('png');
    }

    isJsonFile(file) {
        return file && (file.type.includes('json') || file.name.toLowerCase().endsWith('.json'));
    }
}