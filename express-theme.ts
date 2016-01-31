import * as express from "express";

export class Theme {
	private _router: express.Router;
	constructor(public options: any) {
		this._router = express.Router();

		this._router.use(function(req, res, next) {
			console.log('Time:', Date.now());
			next();
		});

		this._router.get('/', (req, res, next) => {
			res.render('index', { title: 'Express' });
		});

		/* GET users listing. */
		this._router.get('/users', (req, res, next) => {
			res.send('respond with a resource');
		});
	}
	get router(): express.Router {
		return this._router;
	}
}
