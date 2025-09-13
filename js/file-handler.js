/**
 * ファイル操作を管理するクラス - GeoJSON出力専用
 */
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
}