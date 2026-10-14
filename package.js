Package.describe({
	name: 'poon-jobs',
	version: '1.0.0',
	summary: 'Poon background jobs',
});

Package.onUse(api => {
	api.use('ecmascript');
	api.use('meteor');
	api.use('modules');
	api.use('mongo');
	api.use('poon-router');
	api.mainModule('client.js', 'client');
	api.mainModule('server.js', 'server');
});
