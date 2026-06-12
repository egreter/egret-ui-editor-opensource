exports.default = async function notarizing(context) {
	const { electronPlatformName, appOutDir } = context;
	if (electronPlatformName !== 'darwin') {
		return;
	}
	// 已禁用公示（Notarization）步骤，以避免网络超时失败并加速打包。
	// 如果日后需要重新启用，请取消以下注释并配置 APPLE_ID / APPLE_ID_PASS / APPLE_TEAM_ID 环境变量。
	/*
	const { notarize } = await import('@electron/notarize');
	return await notarize({
		appBundleId: 'com.egret.wing',
		appPath: `${appOutDir}/Egret UI Editor.app`,
		appleId: process.env.APPLE_ID,
		appleIdPassword: process.env.APPLE_ID_PASS,
		teamId: process.env.APPLE_TEAM_ID,
	});
	*/
};