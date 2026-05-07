import { IExmlModel, SelectedListChangedEvent } from 'egret/exts/exml-exts/exml/common/exml/models';
import { INode, TreeChangedEvent, TreeChangedKind } from 'egret/exts/exml-exts/exml/common/exml/treeNodes';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'egret/base/common/event';
import { dispose } from 'egret/base/common/lifecycle';

/**
 * ExmlModel属性自动刷新的监听助手
 */
export class AutoRefreshHelper implements IDisposable{

	// 全局刷新队列
	private static _globalRefreshQueue: Set<AutoRefreshHelper> = new Set();
	private static _globalRefreshTimer: any = null;
	private static _lastRefreshTime: number = 0;
	private static readonly MIN_REFRESH_INTERVAL: number = 50;

	private _relateProps:string[] = [];
	private _onChanged:Emitter<INode[]>;

	private toDisposes: IDisposable[] = [];

	constructor(relateProps:string[]){
		this._relateProps = relateProps;
		this._onChanged = new Emitter<INode[]>();
	}

	/**
	 * 选择节点或指定属性发生了改变事件
	 */
	public get onChanged():Event<INode[]>{
		return this._onChanged.event;
	}

	private _model: IExmlModel;
	/**
	 * 数据模型
	 */
	public get model(): IExmlModel {
		return this._model;
	}
	public set model(value: IExmlModel) {
		if (this._model === value) {
			return;
		}
		dispose(this.toDisposes);
		this._model = value;
		if (this._model) {
			this.toDisposes.push(this._model.onTreeChanged(e=>this.treeChanged_handler(e)));
			this.toDisposes.push(this._model.onSelectedListChanged(e=>this.selectedListChanged_handler(e)));
			this.toDisposes.push(this._model.onStateChanged(e=>this.selectedListChanged_handler(e)));
		}
		this.selectedListChanged_handler();
	}

	private _scheduledRefresh: boolean = false;

	private treeChanged_handler(e:TreeChangedEvent):void{
		if(!e.value){
			return;
		}
		if(e.kind == TreeChangedKind.ADD) {
			this.scheduleRefresh();
		}else if(this._relateProps && this._relateProps.length > 0){
			const changedProperty = e.property as string;
			const isRelatedProperty = this._relateProps.indexOf(changedProperty) !== -1;
			const isInstanceValueChange = changedProperty === null;

			if (!isRelatedProperty && !isInstanceValueChange) {
				return;
			}
			this.scheduleRefresh();
		}
	}
	private selectedListChanged_handler(e:SelectedListChangedEvent = null):void{
		this.scheduleRefresh();
	}

	private refreshing:boolean = false;
	private scheduleRefresh(): void {
		if (this._scheduledRefresh) {
			return;
		}
		this._scheduledRefresh = true;
		AutoRefreshHelper._globalRefreshQueue.add(this);

		if (AutoRefreshHelper._globalRefreshTimer) {
			return;
		}

		const now = Date.now();
		const timeSinceLastRefresh = now - AutoRefreshHelper._lastRefreshTime;

		if (timeSinceLastRefresh < AutoRefreshHelper.MIN_REFRESH_INTERVAL) {
			const delay = AutoRefreshHelper.MIN_REFRESH_INTERVAL - timeSinceLastRefresh;
			AutoRefreshHelper._globalRefreshTimer = setTimeout(() => {
				AutoRefreshHelper._globalRefreshTimer = null;
				AutoRefreshHelper._lastRefreshTime = Date.now();
				AutoRefreshHelper.flushGlobalRefreshQueue();
			}, delay);
		} else {
			AutoRefreshHelper._lastRefreshTime = now;
			AutoRefreshHelper._globalRefreshTimer = setTimeout(() => {
				AutoRefreshHelper._globalRefreshTimer = null;
				AutoRefreshHelper.flushGlobalRefreshQueue();
			}, 0);
		}
	}

	private static flushGlobalRefreshQueue(): void {
		const queue = new Set(AutoRefreshHelper._globalRefreshQueue);
		AutoRefreshHelper._globalRefreshQueue.clear();

		requestAnimationFrame(() => {
			queue.forEach(helper => {
				helper._scheduledRefresh = false;
				if (helper.refreshing) {
					return;
				}
				helper.refreshing = true;
				try {
					helper.doRefresh();
				} finally {
					helper.refreshing = false;
				}
			});
		});
	}

	private refresh():void{
		if(this.refreshing){
			return;
		}
		this.refreshing = true;
		setTimeout(() => {
			this.refreshing = false;
			this.doRefresh();
		}, 100);
	}

	private doRefresh():void{
		if(this._model){
			this._onChanged.fire(this._model.getSelectedNodes());
		}else{
			this._onChanged.fire([]);
		}
	}

	/**
	 * 释放
	 */
	public dispose():void{
		dispose(this.toDisposes);
		this._model = null;
	}
}