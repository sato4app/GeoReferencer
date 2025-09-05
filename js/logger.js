// ログ機能のユーティリティ
import { LOG_LEVELS } from '../constants.js';

export class Logger {
    constructor(context = 'RouteEditor') {
        this.context = context;
        this.isDebugMode = this.checkDebugMode();
    }
    
    checkDebugMode() {
        // URLパラメータまたはlocalStorageでデバッグモードを確認
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('debug') === 'true' || 
               localStorage.getItem('routeEditor.debug') === 'true';
    }
    
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.context}] [${level.toUpperCase()}]`;
        
        if (data) {
            return `${prefix} ${message}`;
        }
        return `${prefix} ${message}`;
    }
    
    error(message, error = null) {
        const formattedMessage = this.formatMessage(LOG_LEVELS.ERROR, message);
        console.error(formattedMessage, error || '');
        
        // エラーは常に記録
        this.logToStorage(LOG_LEVELS.ERROR, message, error);
    }
    
    warn(message, data = null) {
        const formattedMessage = this.formatMessage(LOG_LEVELS.WARN, message);
        console.warn(formattedMessage, data || '');
        
        if (this.isDebugMode) {
            this.logToStorage(LOG_LEVELS.WARN, message, data);
        }
    }
    
    info(message, data = null) {
        const formattedMessage = this.formatMessage(LOG_LEVELS.INFO, message);
        console.info(formattedMessage, data || '');
        
        if (this.isDebugMode) {
            this.logToStorage(LOG_LEVELS.INFO, message, data);
        }
    }
    
    debug(message, data = null) {
        if (!this.isDebugMode) return;
        
        const formattedMessage = this.formatMessage(LOG_LEVELS.DEBUG, message);
        console.debug(formattedMessage, data || '');
        this.logToStorage(LOG_LEVELS.DEBUG, message, data);
    }
    
    logToStorage(level, message, data) {
        try {
            const logs = JSON.parse(localStorage.getItem('routeEditor.logs') || '[]');
            const logEntry = {
                timestamp: new Date().toISOString(),
                context: this.context,
                level,
                message,
                data: data ? JSON.stringify(data) : null
            };
            
            logs.push(logEntry);
            
            // 最大1000件のログを保持
            if (logs.length > 1000) {
                logs.splice(0, logs.length - 1000);
            }
            
            localStorage.setItem('routeEditor.logs', JSON.stringify(logs));
        } catch (e) {
            // ストレージエラーは無視（プライベートモードなど）
            console.warn('ログの保存に失敗しました:', e.message);
        }
    }
    
    getLogs() {
        try {
            return JSON.parse(localStorage.getItem('routeEditor.logs') || '[]');
        } catch (e) {
            return [];
        }
    }
    
    clearLogs() {
        try {
            localStorage.removeItem('routeEditor.logs');
            this.info('ログがクリアされました');
        } catch (e) {
            this.error('ログのクリアに失敗しました', e);
        }
    }
}