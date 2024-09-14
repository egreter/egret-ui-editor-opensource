import { IExmlModel } from './models';
import { INode, isInstanceof, IContainer, IClass } from './treeNodes';
import { coordinateTransfrom } from '../utils/transfroms';
import { EUI } from '../project/parsers/core/commons';
import { sortOnDepth, cleanRelatvieProps } from './exmlModel';
import { isArray } from 'egret/base/common/types';
import { endWith } from '../utils/strings';
import { copypAllPropertyToClipboard, pastePosFromClipboard, pasteSizeFromClipboard, pasteRestrictFromClipboard } from './nodeClipboard';
import { IDisposable } from 'egret/base/common/lifecycle';

import * as sax from '../sax/sax';
import * as xmlTagUtil from '../sax/xml-tagUtils';
import * as fs from 'fs';
import { XMLFormatUtil } from '../contentassist/XMLFormat';

/**
 * ExmlModel工具
 */
export class ExmlModelHelper implements IDisposable {
	/**
	 *
	 */
	constructor() {

	}
	protected _model: IExmlModel;
	/**
	 * 当前视图的exml数据层
	 */
	public getModel(): IExmlModel {
		return this._model;
	}
	/**
	 * 当前视图的exml数据层
	 */
	public setModel(value: IExmlModel): void {
		if (this._model == value) {
			return;
		}
		this._model = value;
	}

	/**
	 * 组合选中的节点，放进一个Group。
	 */
	public groupNodes(): void {
		const nodeList: INode[] = this._model.getSelectedNodes();
		const length: number = nodeList.length;
		if (length < 2 || nodeList.indexOf(this.rootNode) !== -1) {
			return;
		}
		let topNode: INode = nodeList[0];
		let node: INode;
		for (var i = 0; i < length; i++) {
			node = nodeList[i];
			node.setSelected(false);
			if (isInstanceof(node.getParent(), 'eui.ISingleChild')) {
				nodeList[i] = node.getParent();
				node = node.getParent();
			}
			if (node.getNestLevel() < topNode.getNestLevel()) {
				topNode = node;
			}
		}
		const parentNode: IContainer = topNode.getParent();
		let groupIndex: number = topNode.getParent().getNodeIndex(topNode);
		for (i = 1; i < length; i++) {
			node = nodeList[i];
			const index: number = parentNode.getNodeIndex(node);
			if (index > groupIndex) {
				groupIndex = index;
			}
		}

		const groupNode: IContainer = this._model.createIContainer('Group', EUI);
		topNode.getParent().addNodeAt(groupNode, groupIndex + 1);

		node = nodeList[0];

		const minPos = coordinateTransfrom({ x: 0, y: 0 }, node, groupNode.getParent());
		for (i = 0; i < length; i++) {
			node = nodeList[i];
			var pos = coordinateTransfrom({ x: 0, y: 0 }, node, groupNode.getParent());
			if (pos) {
				if (minPos.x > pos.x) {
					minPos.x = pos.x;
				}
				if (minPos.y > pos.y) {
					minPos.y = pos.y;
				}
			}
		}
		groupNode.setNumber('x', Math.round(minPos.x * 100) / 100);
		groupNode.setNumber('y', Math.round(minPos.y * 100) / 100);
		nodeList.sort(sortOnDepth);
		for (i = 0; i < length; i++) {
			node = nodeList[i];
			pos = coordinateTransfrom({ x: 0, y: 0 }, node, groupNode);
			cleanRelatvieProps(node);
			groupNode.addNode(node);
			node.setNumber('x', Math.round(pos.x * 100) / 100);
			node.setNumber('y', Math.round(pos.y * 100) / 100);
		}
		groupNode.setSelected(true);
	}
	/**
	 * 删除选中的Group，并把子项都移动出来。
	 */
	public unGroupNodes(): void {
		if (!this.canUngroupNodes()) {
			return;
		}
		const nodeList: INode[] = this._model.getSelectedNodes();
		const length: number = nodeList.length;
		for (let i = 0; i < length; i++) {
			const groupNode: IContainer = nodeList[i] as IContainer;
			if (!(isInstanceof(groupNode, 'eui.IContainer')) || !groupNode.getParent()
				|| groupNode.getName() !== 'Group' || groupNode.getNs().uri !== EUI.uri
				|| (isInstanceof(groupNode.getParent(), 'eui.ISingleChild'))) {
				continue;
			}
			const parentNode: IContainer = groupNode.getParent();
			const numChildren: number = groupNode.getNumChildren();
			const nodeIndex: number = parentNode.getNodeIndex(groupNode);
			for (let index = numChildren - 1; index >= 0; index--) {
				const node: INode = groupNode.getNodeAt(index);
				parentNode.addNodeAt(node, nodeIndex);
				const pos = coordinateTransfrom({ x: 0, y: 0 }, node, parentNode);
				node.setNumber('x', Math.round((pos.x + groupNode.getInstance().x) * 100) / 100);
				node.setNumber('y', Math.round((pos.y + groupNode.getInstance().y) * 100) / 100);
				node.setSelected(true);
			}
			parentNode.removeNode(groupNode);
		}
	}
	/**
	 * 是否可以将节点解组
	 */
	public canUngroupNodes(): boolean {
		const nodeList: INode[] = this._model.getSelectedNodes();
		const length: number = nodeList.length;
		for (let i = 0; i < length; i++) {
			const groupNode: IContainer = nodeList[i] as IContainer;
			if (!(isInstanceof(groupNode, 'eui.IContainer')) || !groupNode.getParent()
				|| groupNode.getName() !== 'Group' || groupNode.getNs().uri !== EUI.uri
				|| (isInstanceof(groupNode.getParent(), 'eui.ISingleChild'))) {
				continue;
			}
			return true;
		}
		return false;
	}
	/**
	 * 选择指定节点
	 * @param target 
	 */
	public select(target: INode | INode[]): void {
		const selectedNodes = this._model.getSelectedNodes();
		for (var i = 0; i < selectedNodes.length; i++) {
			const node: INode = selectedNodes[i];
			node.setSelected(false);
		}
		if (target) {
			if (isArray(target)) {
				for (var i = 0; i < target.length; i++) {
					target[i].setSelected(true);
				}
			} else {
				target.setSelected(true);
			}
		}
	}
	/**
	 * 选择全部节点
	 */
	public selectAll(): void {
		const container: IContainer = this.rootNode as IContainer;
		if (!(isInstanceof(container, 'eui.IContainer'))) {
			return;
		}
		for (var i = 0; i < this._model.getSelectedNodes().length; i++) {
			const node: INode = this._model.getSelectedNodes()[i];
			if (node.getParent() !== container) {
				node.setSelected(false);
			}
		}
		for (var i = container.getNumChildren() - 1; i >= 0; i--) {
			container.getNodeAt(i).setSelected(true);
		}
	}

	/**
	 * 是否可以转换成内嵌节点
	 * @param node 
	 */
	public canConvertToInner(node: INode): boolean {
		let classValue: IClass;
		if (this.getModel().getExmlConfig().isInstance(node.getInstance(), 'eui.Component')) {
			classValue = node.getProperty('skinName') as IClass;
		}
		else if (this.getModel().getExmlConfig().isInstance(node.getInstance(), 'eui.DataGroup')) {
			classValue = node.getProperty('itemRendererSkinName') as IClass;
		}
		else {
			return false;
		}
		if (!classValue || !classValue.getIsInner()) {
			return true;
		}
		return false;
	}


	/**
	 * 转换为内嵌节点
	 * @param node 
	 */
	public convertToInner(node: INode): Promise<IClass> {
		let classValue: IClass;
		let className: string;
		let classXML: sax.Tag;
		let propertyName: string;
		if (this.getModel().getExmlConfig().isInstance(node.getInstance(), 'eui.Component')) {
			propertyName = 'skinName';
			classValue = node.getProperty(propertyName) as IClass;
		}
		else if (this.getModel().getExmlConfig().isInstance(node.getInstance(), 'eui.DataGroup')) {
			propertyName = 'itemRendererSkinName';
			classValue = node.getProperty(propertyName) as IClass;
			node.setProperty('itemRenderer', null);
		}

		if (classValue && !classValue.getIsInner() && classValue.getClassName()) {
			className = classValue.getClassName();
		}
		else {
			let nodeClassName: string = this.getModel().getExmlConfig().getClassNameById(node.getName(), node.getNs());
			if (propertyName === 'itemRendererSkinName') {
				nodeClassName = 'eui.ItemRenderer';
			}
			className = this.getModel().getExmlConfig().getDefaultSkinNameByClassName(nodeClassName);
		}

		if (className) {
			const pathUri = this.getModel().getExmlConfig().getProjectConfig().getExmlUri(className);
			const path: string = pathUri ? pathUri.fsPath : '';
			if (endWith(path.toLowerCase(), '.exml')) {
				try {
					//TODO 用fileservice改为异步
					classXML = xmlTagUtil.parse(fs.readFileSync(path, { encoding: 'utf8' }));
					if (classXML.attributes['class']) {
						xmlTagUtil.deleteAttribute(classXML, 'class');
					}
				} catch (error) {
				}
			}
		}

		if (!classXML) {
			classXML = xmlTagUtil.parse('<e:Skin xmlns:e=\"' + EUI.uri + '\" states=\"up,down,disabled\"></e:Skin>');
		}
		classValue = this.getModel().createIClass(null, classXML);
		node.setProperty(propertyName, classValue);
		return Promise.resolve(classValue);
	}

	/**
	 * 根节点对象
	 */
	public get rootNode(): INode {
		return this.getModel() ? this.getModel().getRootNode() : null;
	}

	/**
	 * 复制选中的节点到系统剪贴板
	 */
	public copyNodesToClipboard(): void {
		if (!this.getModel()) {
			return;
		}
		this.getModel().copyNodesToClipboard();
	}

	/**
	 * 剪切选中的节点到系统剪贴板
	 */
	public cutNodesToClipboard(): void {
		if (!this.getModel()) {
			return;
		}
		this.getModel().cutNodesToClipboard();
	}
	/**
	 * 粘贴系统剪贴板中的节点
	 */
	public pasteNodesFromClipboard(): void {
		if (!this.getModel()) {
			return;
		}
		this.getModel().pasteNodesFromClipboard();
	}
	/**
	 * 删除选中的节点,返回删除的节点列表。
	 */
	public removeSelectedNodes(): INode[] {
		if (!this.getModel()) {
			return [];
		}
		return this.getModel().removeSelectedNodes();
	}
	/**
	 * 复制节点的属性
	 */
	public copyNodeProperty(): void {
		if (!this.getModel()) {
			return;
		}
		if (this.getModel().getSelectedNodes().length > 0) {
			copypAllPropertyToClipboard(this.getModel().getSelectedNodes()[0]);
		}
	}
	/**
	 * 粘贴节点位置
	 */
	public pasteNodePos(): void {
		if (!this.getModel()) {
			return;
		}
		pastePosFromClipboard(this.getModel().getSelectedNodes());
	}
	/**
	 * 粘贴节点尺寸
	 */
	public pasteNodeSize(): void {
		if (!this.getModel()) {
			return;
		}
		pasteSizeFromClipboard(this.getModel().getSelectedNodes());
	}
	/**
	 * 粘贴节点约束条件
	 */
	public pasteNodeRestrict(): void {
		if (!this.getModel()) {
			return;
		}
		pasteRestrictFromClipboard(this.getModel().getSelectedNodes());
	}

	/**
	 * 释放
	 */
	public dispose(): void {
		this._model = null;
	}

	//================================================
	// rontian 扩展的静态方法
	//================================================
	public static formatEXML(text: string, options?: monaco.languages.FormattingOptions): string {
		if (!options) {
			options = {
				tabSize: 4,
				insertSpaces: true,
			};
		}
		const tabSize = options.tabSize;
		const insertSpaces = options.insertSpaces;
		let start = 0;
		let end = text.length;
		let lineBreak: string = '\n';
		if (text.indexOf('\r\n') !== -1) {
			lineBreak = '\r\n';
		} else if (text.indexOf('\n') !== -1) {
			lineBreak = '\n';
		} else if (text.indexOf('\r') !== -1) {
			lineBreak = '\n';
		}
		const result = XMLFormatUtil.format(text, start, end, !insertSpaces, insertSpaces ? tabSize : 1, 120, false, true, lineBreak);
		return result.formatedText;
	}
	public static canOptimizeEXML(text: string): boolean {
		return this.hasDefaultProperties(text) || this.hasLongDecimalProperties(text);
	}
	public static startOptimizeEXML(text: string, formated: boolean = true): string {
		if (this.hasDefaultProperties(text)) {
			text = this.optimizeDefaultProperties(text);
		}
		if (this.hasLongDecimalProperties(text)) {
			text = this.optimizeLongDecimalProperties(text);
		}
		text = this.optimizeSpace(text);
		if (formated) {
			text = this.formatEXML(text);
		}
		return text;
	}
	private static hasDefaultProperties(text: string): boolean {
		let reg = /((?:\w+\.)?(?:\b(?:scaleX|scaleY|alpha)="1"|\b(?:x|y)="0"|\b(?:visible)="true"))/gm;
		if (reg.test(text)) {
			return true;
		}
		return false;
	}
	private static optimizeDefaultProperties(text: string): string {
		let reg = /((?:\w+\.)?(?:\b(?:scaleX|scaleY|alpha)="1"|\b(?:x|y)="0"|\b(?:visible)="true"))/gm;
		return text.replace(reg, (template: string) => {
			return "";
		});
	}
	private static hasLongDecimalProperties(text: string): boolean {
		let reg = /\b(?:x|y|width|height|left|right|top|bottom|alpha|rotation|scaleX|scaleY)="-?(\d+\.\d{2,})"/gm;
		if (reg.test(text)) {
			return true;
		}
		return false;
	}
	private static optimizeLongDecimalProperties(text: string): string {
		let reg = /\b(?:x|y|width|height|left|right|top|bottom|alpha|rotation|scaleX|scaleY)="-?(\d+\.\d{2,})"/gm;
		return text.replace(reg, (template: string, decimal: string) => {
			return template.replace(/-?\d+\.\d{2,}/, (Math.round(parseFloat(decimal) * 100) / 100).toString());
		});
	}
	private static optimizeSpace(text: string): string {
		let reg = /\<\s*(?:[^<>]*?)\s*>|<\s*(?:[^<>]*?)\s*\/>/g;
		return text.replace(reg, (template: string) => {
			return template.replace(/\s+/g, " ");
		});
	}
}