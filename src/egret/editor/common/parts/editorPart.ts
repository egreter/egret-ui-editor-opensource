import { Emitter, Event } from 'egret/base/common/event';
import { IEditorPart, IEditor, EditorOpeningEvent, IEditorOpeningEvent, IMultiPageEditor } from '../../core/editors';
import { IEditorInput } from '../../core/inputs';
import { EditorInput } from '../input/editorInput';
import { BaseEditor } from '../../browser/baseEditor';
import { EditorRegistry, IEditorDescriptor } from 'egret/editor/editorRegistry';
import { IInstantiationService } from 'egret/platform/instantiation/common/instantiation';
import { ConfirmResult } from 'egret/workbench/services/editor/common/models';
import { dispose, IDisposable } from 'egret/base/common/lifecycle';
import { IStorageService, StorageScope } from 'egret/platform/storage/common/storage';
import { IFocusablePart } from 'egret/platform/operations/common/operations';
import URI from 'egret/base/common/uri';
import { IOperationBrowserService } from '../../../platform/operations/common/operations-browser';
import { SystemCommands } from '../../../platform/operations/commands/systemCommands';
import { localize } from '../../../base/localization/nls';
import { IWorkspaceService } from 'egret/platform/workspace/common/workspace';
import { innerWindowManager } from 'egret/platform/innerwindow/common/innerWindowManager';
import { EditMode } from 'egret/exts/exml-exts/exml/browser/commons';

const OPEN_EDITORS_STORAGE = 'openEditorsStorageKey';

/**
 * 编辑器部件，相当于一个管理器，管理多个编辑器。
 */
export class EditorPart implements IEditorPart, IFocusablePart {
	private _onEditorsChanged: Emitter<void>;
	private _onEditorOpening: Emitter<IEditorOpeningEvent>;
	private toDispose: IDisposable[] = [];

	constructor(
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IStorageService protected storageService: IStorageService,
		@IOperationBrowserService protected operationService: IOperationBrowserService,
		@IWorkspaceService protected workspaceService: IWorkspaceService,
	) {
		//events
		this._onEditorsChanged = new Emitter<void>();
		this._onEditorOpening = new Emitter<IEditorOpeningEvent>();
		this.toDispose.push(innerWindowManager.WindowChanged(this.innerWindowChanged, this));

		this.initCommands();
	}

	/** 注册当前编辑器可以执行的命令 */
	private initCommands(): void {
		this.operationService.registerFocusablePart(this);
	}

	/**
	 * 得到这个部件对应的Dom节点
	 */
	public getRelativeELement(): HTMLElement {
		return this.documentGroup ? this.documentGroup.root : null;
	}

	/**
	 * 运行一个命令
	 * @param command 要运行的命令
	 */
	public executeCommand<T>(command: string, ...args): Promise<any> {
		const currentEditor = this.getActiveEditor();
		if (currentEditor) {
			if ('EditMode' in currentEditor) {
				if ((<any>currentEditor as IMultiPageEditor).EditMode === EditMode.CODE) {
					return Promise.resolve(void 0);
				}
			}
			return currentEditor.getModel().then(model => {
				if (command == SystemCommands.REDO) {
					return model.redo();
				} else if (command == SystemCommands.UNDO) {
					return model.undo();
				}
			});
		}
		return Promise.resolve(void 0);
	}

	/**
	 * 是否可以运行指定命令
	 * @param command 需要判断的命令
	 */
	public hasCommand(command: string): boolean {
		return [
			SystemCommands.UNDO,
			SystemCommands.REDO
		].indexOf(command as SystemCommands) != -1;
	}

	private innerWindowChanged(): void {
		// 根节点表示当前没有内置窗口
		if (innerWindowManager.currentActivateWindow === innerWindowManager.rootWindow) {
			if (this.getActiveEditor()) {
				this.getActiveEditor().doFocusIn();
			}
		} else {
			if (this.getActiveEditor()) {
				this.getActiveEditor().doFocusOut();
			}
		}
	}

	protected documentGroup: boxlayout.DocumentGroup;
	/**
	 * 初始化文档区
	 * @param documentGroup 
	 */
	public initDocument(documentGroup: boxlayout.DocumentGroup): void {
		this.documentGroup = documentGroup;
		this.documentGroup.layout.addEventListener(boxlayout.BoxLayoutEvent.FOCUS_CHANGED, this.editorFocusChanged_handler, this);
		this.documentGroup.layout.addEventListener(boxlayout.BoxLayoutEvent.PANEL_ADDED, this.editorOpen_handler, this);
		this.documentGroup.layout.addEventListener(boxlayout.BoxLayoutEvent.PANEL_REMOVED, this.editorClose_handler, this);
		this.restoreDocumentGroupLayout();
		setTimeout(() => {
			if (this.getActiveEditor()) {
				this.getActiveEditor().doFocusIn();
			}
		}, 10);
	}

	protected restoreDocumentGroupLayout(): void {
		const layoutConfigStr = this.storageService.get(OPEN_EDITORS_STORAGE, StorageScope.WORKSPACE);
		if (layoutConfigStr) {
			const layoutConfig = JSON.parse(layoutConfigStr);
			this.documentGroup.layout.applyLayoutConfig(layoutConfig);
		}
	}

	private editorFocusChanged_handler(e: boxlayout.BoxLayoutEvent): void {
		const editor = e.data as BaseEditor;
		if (this._activeEditor && this._activeEditor === editor) {
			return;
		}
		if (this.getActiveEditor()) {
			this.getActiveEditor().doFocusOut();
		}
		this._activeEditor = editor;
		if (this.getActiveEditor()) {
			this.getActiveEditor().doFocusIn();
		}
		this._onEditorsChanged.fire();
	}

	private editorOpen_handler(e: boxlayout.BoxLayoutEvent): void {
		const editor = e.data ? e.data.panel as BaseEditor : null;
	}

	private editorClose_handler(e: boxlayout.BoxLayoutEvent): void {
		const editor = e.data ? e.data.panel as BaseEditor : null;
		if (typeof editor['doClose'] === 'function') {
			editor.doClose();
		}
	}

	/**
	 * 编辑器改变事件
	 */
	public get onEditorsChanged(): Event<void> {
		return this._onEditorsChanged.event;
	}
	/**
	 * 编辑器打开事件
	 */
	public get onEditorOpening(): Event<IEditorOpeningEvent> {
		return this._onEditorOpening.event;
	}

	private _activeEditor: IEditor;
	/**
	 * 得到当前激活的编辑器
	 */
	public getActiveEditor(): IEditor {

		if (this._activeEditor) {
			return this._activeEditor;
		}
		if (!this.documentGroup) {
			return null;
		}
		const activeGroup = this.documentGroup.layout.getActiveTabGroup();
		if (!activeGroup) {
			return null;
		}
		const panel = activeGroup.selectedPanel;
		if (panel instanceof BaseEditor) {
			this._activeEditor = panel;
			return panel;
		}
		return null;
	}
	/**
	 * 得到当前激活编辑器的输入流
	 */
	public getActiveEditorInput(): IEditorInput {
		if (this.getActiveEditor()) {
			return this.getActiveEditor().input;
		}
		return null;
	}
	/**
	 * 得到编辑器
	 * @param uri 
	 */
	public getEditors(uri: URI): IEditor[] {
		const targetEditor: IEditor[] = [];
		const openEditors = this.getOpenEditors();
		for (let i = 0; i < openEditors.length; i++) {
			if (openEditors[i].input && openEditors[i].input.getResource().toString() == uri.toString()) {
				targetEditor.push(openEditors[i]);
			}
		}
		return targetEditor;
	}
	/**
	 * 得到当前打开的所有编辑器
	 */
	public getOpenEditors(): IEditor[] {
		return this.documentGroup.getAllPanels() as BaseEditor[];
	}
	/**
	 * 通过输入流打开一个编辑器，如果已经打开了这个编辑器则激活
	 * @param input 输入流
	 */
	public openEditor(input: EditorInput, isPreview: boolean = false, instantiationService?: IInstantiationService): Promise<IEditor> {
		const focusCache = document.activeElement as HTMLElement;
		if (!input) {
			return Promise.resolve(null);
		}
		const event = new EditorOpeningEvent(input);
		this._onEditorOpening.fire(event);
		const prevented = event.isPrevented();
		if (prevented) {
			return prevented();
		}
		return this.doOpenEditor(input, isPreview, instantiationService).then(result => {
			if (document.activeElement != focusCache) {
				focusCache.focus();
			}
			return result;
		});
	}

	private doOpenEditor(input: EditorInput, isPreview: boolean = false, instantiationService?: IInstantiationService): Promise<BaseEditor> {
		//通过输入流类型得到编辑器描述
		const descriptor = EditorRegistry.getEditor(input);
		if (!descriptor) {
			return Promise.reject(new Error(localize('editorPart.doOpenEidtor.errorTips', 'Unable to get registered editor description via input')));
		}

		const editor = this.doShowEditor(descriptor, input, true, isPreview, instantiationService);
		if (!editor) {
			return Promise.resolve(null);
		}
		const inputPromise = this.doSetInput(editor, input);
		return inputPromise;
	}

	/**
	 * 打开编辑器
	 * @param input 
	 */
	public createEditor(input: EditorInput, isPreview: boolean = false, instantiationService?: IInstantiationService): BaseEditor {
		//通过输入流类型得到编辑器描述
		const descriptor = EditorRegistry.getEditor(input);
		if (!descriptor) {
			return null;
		}

		const editor = this.doShowEditor(descriptor, input, false, isPreview, instantiationService);
		if (!editor) {
			return null;
		}
		this.doSetInput(editor, input);
		return editor;
	}

	private doShowEditor(descriptor: IEditorDescriptor, input: EditorInput, show: boolean, isPreview: boolean, instantiationService?: IInstantiationService): BaseEditor {
		const panels = this.documentGroup.getAllPanels();
		let existEditor: BaseEditor = null;
		for (let i = 0; i < panels.length; i++) {
			if (panels[i] instanceof BaseEditor) {
				const editor = panels[i] as BaseEditor;
				if (editor.input && editor.input.matches(input)) {
					existEditor = editor;
					break;
				}
				if (isPreview && editor.isPreview && descriptor.describes(editor)) {
					if (!editor.input || !editor.input.matches(input)) {
						editor.setInput(input);
					}
					existEditor = editor;
					break;
				}
			}
		}
		let targetEditor: BaseEditor = null;
		if (existEditor && descriptor.describes(existEditor)) {
			existEditor.focus();
			targetEditor = existEditor;
			if (targetEditor.isPreview && targetEditor.isPreview !== isPreview) {
				targetEditor.setPreview(isPreview);
			}
		} else {
			targetEditor = this.createEditorInstance(descriptor, instantiationService);
			if (isPreview) {
				targetEditor.setPreview(isPreview);
			}
			//添加到文档区显示出来
			if (show) {
				this.documentGroup.addPanel(targetEditor);
			}
		}
		targetEditor.setTitle(input.getTitle());
		targetEditor.setId(input.getResource().fsPath);
		return targetEditor;
	}

	protected createEditorInstance(descriptor: IEditorDescriptor, instantiationService?: IInstantiationService): BaseEditor {
		const editor = descriptor.instantiate(instantiationService ?? this.instantiationService);
		return editor;
	}

	private doSetInput(editor: BaseEditor, input: EditorInput): Promise<BaseEditor> {
		const previousInput = editor.input;
		const inputChanged = (!previousInput || !previousInput.matches(input));
		return editor.setInput(input).then(() => {
			editor.focus();
			if (inputChanged) {
				this._onEditorsChanged.fire();
			}
			return editor;
		}, e => {
			//TODO 这里应该增加处理
			return null;
		});
	}

	/**
	 * 打开一组编辑器，如果已打开则忽略
	 * @param inputs 输入流数组
	 */
	public openEditors(inputs: EditorInput[], instantiationService?: IInstantiationService): Promise<IEditor[]> {
		if (!inputs || !inputs.length) {
			return Promise.resolve([]);
		}
		const promises: Promise<IEditor>[] = [];
		for (let i = 0; i < inputs.length; i++) {
			promises.push(this.openEditor(inputs[i], false, instantiationService));
		}
		return Promise.all(promises);
	}
	/**
	 * 关闭一个编辑器
	 * @param editor 指定要关闭的编辑器
	 */
	public closeEditor(editor: IEditor): Promise<void> {
		return this.handleDirty([editor]).then(veto => {
			if (veto) {
				return;
			}
			this.doCloseEditor(editor);
		});
	}
	private doCloseEditor(editor: IEditor): void {
		const existEditor: BaseEditor = editor as BaseEditor;
		if (existEditor instanceof BaseEditor) {
			//释放掉输入流，同时也释放掉对应的数据模块
			dispose(editor.input);
			//释放编辑器
			dispose(existEditor);
			if (this.documentGroup.getAllPanels().length == 1) {
				this.documentGroup.removePanel(existEditor);
			} else {
				if (existEditor.ownerGroup.panels.length == 1) {
					existEditor.ownerGroup.ownerElement.ownerLayout.getAllTabGroup();
					const ownerElement = existEditor.ownerGroup.ownerElement;
					const ownerLayout = existEditor.ownerGroup.ownerElement.ownerLayout;
					this.documentGroup.removePanel(existEditor);
					ownerLayout.removeBoxElement(ownerElement);
				} else {
					this.documentGroup.removePanel(existEditor);
				}
			}
		}
	}

	private handleDirty(editors: IEditor[]): Promise<boolean> {
		if (!editors.length) {
			return Promise.resolve(false);
		}
		return this.doHandleDirty(editors.shift()).then(veto => {
			if (veto) {
				return veto;
			}
			return this.handleDirty(editors);
		});
	}

	private async doHandleDirty(editor: IEditor): Promise<boolean> {
		if ('syncModelData' in editor) {
			await (<any>editor as IMultiPageEditor).syncModelData();
		}
		if (!editor || !editor.input || !editor.input.isDirty()) {
			return Promise.resolve(false);
		}
		const input = editor.input as EditorInput;
		return this.openEditor(input).then(() => {
			return input.confirmSave().then(res => {
				if (!input.isDirty()) {
					return res === ConfirmResult.CANCEL ? true : false;
				}
				switch (res) {
					case ConfirmResult.SAVE:
						return input.save().then(ok => !ok);
					case ConfirmResult.DONT_SAVE:
						return false; //直接关闭
					case ConfirmResult.CANCEL:
						return true; // veto
				}
				return true;
			});
		});
	}

	/**
	 * 关闭多个编辑器
	 * @param inputs 输入流数组
	 */
	public closeEditors(editors: IEditor[]): Promise<void> {
		return new Promise((resolve, reject) => {
			const closeNext = () => {
				if (editors.length == 0) {
					resolve();
					return;
				}
				const editor = editors.shift();
				this.closeEditor(editor).then(() => {
					closeNext();
				}, error => {
					reject(error);
				});
			};
			closeNext();
		});
	}
	/**
	 * 关闭
	 */
	public shutdown(): void {
		dispose(this.toDispose);
		const documentLayout = this.documentGroup.layout.getLayoutConfig();
		const layoutConfigStr = JSON.stringify(documentLayout);
		this.storageService.store(OPEN_EDITORS_STORAGE, layoutConfigStr, StorageScope.WORKSPACE);
	}
}