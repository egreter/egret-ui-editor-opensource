exports.default = async function notarizing(context) {
	const { electronPlatformName, appOutDir } = context;
	if (electronPlatformName !== 'darwin') {
		return;
	}
	// 动态导入 ES Module
	const { notarize } = await import('@electron/notarize');
	return await notarize({
		appBundleId: 'com.egret.wing',
		appPath: `${appOutDir}/Egret UI Editor.app`,
		appleId: process.env.APPLE_ID,
		appleIdPassword: process.env.APPLE_ID_PASS,
		teamId: process.env.APPLE_TEAM_ID,
	});
};