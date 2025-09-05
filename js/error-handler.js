// エラーハンドリングのユーティリティ
import { CONFIG, CSS_CLASSES } from '../constants.js';
import { Logger } from './logger.js';

export class ErrorHandler {
    constructor() {
        this.logger = new Logger('ErrorHandler');
        this.setupGlobalErrorHandlers();
    }
    
    setupGlobalErrorHandlers() {
        // 未キャッチのエラーを処理
        window.addEventListener('error', (event) => {
            this.logger.error('未処理のエラー', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
        });
        
        // Promise rejection を処理
        window.addEventListener('unhandledrejection', (event) => {
            this.logger.error('未処理のPromise rejection', event.reason);
        });
    }
    
    /**
     * エラーメッセージボックスを表示
     * @param {string} title - エラーのタイトル
     * @param {string} message - エラーメッセージ
     * @param {Error} [error] - エラーオブジェクト（オプション）
     */
    showError(title, message, error = null) {
        this.logger.error(`${title}: ${message}`, error);
        this.showMessageBox(title, message, CSS_CLASSES.ERROR);
    }
    
    /**
     * 警告メッセージボックスを表示
     * @param {string} title - 警告のタイトル
     * @param {string} message - 警告メッセージ
     */
    showWarning(title, message) {
        this.logger.warn(`${title}: ${message}`);
        this.showMessageBox(title, message, CSS_CLASSES.WARNING);
    }
    
    /**
     * 成功メッセージボックスを表示
     * @param {string} title - 成功のタイトル
     * @param {string} message - 成功メッセージ
     */
    showSuccess(title, message) {
        this.logger.info(`${title}: ${message}`);
        this.showMessageBox(title, message, CSS_CLASSES.SUCCESS);
    }
    
    /**
     * メッセージボックスを表示する内部メソッド
     * @param {string} title - タイトル
     * @param {string} message - メッセージ
     * @param {string} type - メッセージタイプ（error, warning, success）
     */
    showMessageBox(title, message, type) {
        // 既存のメッセージボックスを削除
        this.clearExistingMessageBoxes();
        
        const messageBox = document.createElement('div');
        messageBox.className = `${CSS_CLASSES.MESSAGE_BOX} ${type}`;
        messageBox.setAttribute('role', 'alert');
        messageBox.setAttribute('aria-live', 'polite');
        
        messageBox.innerHTML = `
            <h3 class="${type}">${this.escapeHtml(title)}</h3>
            <p>${this.escapeHtml(message)}</p>
            <button class="${type}" type="button" aria-label="メッセージを閉じる">OK</button>
        `;
        
        // ボタンのクリックイベント
        const button = messageBox.querySelector('button');
        button.addEventListener('click', () => {
            this.removeMessageBox(messageBox);
        });
        
        // ESCキーで閉じる
        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                this.removeMessageBox(messageBox);
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
        // 自動で5秒後に閉じる（エラー以外）
        if (type !== CSS_CLASSES.ERROR) {
            setTimeout(() => {
                if (document.body.contains(messageBox)) {
                    this.removeMessageBox(messageBox);
                    document.removeEventListener('keydown', handleKeydown);
                }
            }, 5000);
        }
        
        document.body.appendChild(messageBox);
        
        // フォーカスをボタンに移動（アクセシビリティ）
        button.focus();
    }
    
    /**
     * メッセージボックスを削除
     * @param {HTMLElement} messageBox - 削除するメッセージボックス
     */
    removeMessageBox(messageBox) {
        if (messageBox && document.body.contains(messageBox)) {
            messageBox.style.opacity = '0';
            messageBox.style.transform = 'translate(-50%, -50%) scale(0.9)';
            messageBox.style.transition = 'all 0.2s ease';
            
            setTimeout(() => {
                if (document.body.contains(messageBox)) {
                    document.body.removeChild(messageBox);
                }
            }, 200);
        }
    }
    
    /**
     * 既存のメッセージボックスをクリア
     */
    clearExistingMessageBoxes() {
        const existingBoxes = document.querySelectorAll(`.${CSS_CLASSES.MESSAGE_BOX}`);
        existingBoxes.forEach(box => {
            this.removeMessageBox(box);
        });
    }
    
    /**
     * HTMLエスケープ
     * @param {string} text - エスケープするテキスト
     * @returns {string} エスケープされたテキスト
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 非同期関数をラップしてエラーハンドリングを追加
     * @param {Function} asyncFn - 非同期関数
     * @param {string} context - エラーのコンテキスト
     * @returns {Function} ラップされた関数
     */
    wrapAsync(asyncFn, context = 'Async Operation') {
        return async (...args) => {
            try {
                return await asyncFn.apply(this, args);
            } catch (error) {
                this.logger.error(`${context}でエラーが発生しました`, error);
                this.showError('エラー', `${context}中にエラーが発生しました: ${error.message}`);
                throw error;
            }
        };
    }
    
    /**
     * モジュールの初期化状態をチェック
     * @param {Object} module - チェックするモジュール
     * @param {string} moduleName - モジュール名
     * @throws {Error} モジュールが初期化されていない場合
     */
    requireModule(module, moduleName) {
        if (!module) {
            const error = new Error(`${moduleName}が初期化されていません`);
            this.logger.error(error.message);
            throw error;
        }
    }
}

// シングルトンインスタンス
export const errorHandler = new ErrorHandler();