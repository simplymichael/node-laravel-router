"use strict";

const path = require("path");
const laravelToExpress = require("./laravel-to-express");
const uriWithParams = require("./uri-with-params");

const BACKSLASH_REGEX = /\\/g;
const defaultGroupOptions = {
  prefix: "/",
  middleware: [],
  namespace: "",
  patterns: {},
  meta: {}
};
const defaultRouteOptions = {
  method: "get",
  uri: "/",
  middleware: [],
  name: "",
  patterns: {},
  meta: {}
};
const proxy = {
  get(router, method) {
    let handler;

    if(method in router) {
      handler = router[method];
    } else {
      handler = function handleRequest(options, action) {
        if(typeof options === "string" || options instanceof String) {
          options = { uri: options };
        }

        options.method = method;
        router.route(options, action);
      };
    }

    return handler;
  },
};

/**
 * Determine if passed app is an Express (or an Express-type) app.
 */
function isExpressApp(app) {
  return (
    app &&
    typeof app.listen === "function" &&
    typeof app.use === "function"
  );
}

/**
 * Create and return Router.
 *
 * @param {Object} app (optional): An Express app instance
 * @param {Function} mapActionToHandler (optional)
 * @return {Router}
 *
 * ----------------
 * Usage examples:
 * ----------------
 *
 * (Optionally) Define a custom action handler:
 * const mapActionToHandler = (action, routeDescription, routeOptions) => {
 *    return action.customHandler;
 *  }
 *
 * 1. With Express (or Express-type) app:
 *    const app = express();
 *    const router = createRouter(app);
 *    // Setup routing using the router's methods: get, route, serve, etc.
 *    // See the README docs for more info.
 *    // Routing is automatically applied on setup.
 *
 * 2. With Express (or Express-type) app and custom action handler:
 *    const app = express();
 *    const router = createRouter(app, mapActionToHandler);
 *    // Setup routing using the router's methods: get, route, serve, etc.
 *    // See the README docs for more info.
 *    // Routing is automatically applied on setup.
 *
 * 3. Generic Node app
 *    const router = createRouter();
 *    // Setup routing using the router's methods: get, route, serve, etc.
 *    // See the README docs for more info.
 *    // Routing is NOT automatically applied after setup.
 *    // To apply the routing call the `apply()` method on the router,
 *    // passing in your custom routing function.
 *
 * 4. Generic Node app with custom action handler:
 *    const router = createRouter(mapActionToHandler);
 *    // Setup routing using the router's methods: get, route, serve, etc.
 *    // See the README docs for more info.
 *    // Routing is NOT automatically applied after setup.
 *    // To apply the routing call the `apply()` method on the router,
 *    // passing in your custom routing function.
 *
 */
module.exports = function createRouter(...args) {
  /*
   * Express app instance
   */
  let app;
  let mapActionToHandler = (action) => action;
  const namedUrls = {};

  if(args.length === 1) {
    const arg = args[0];

    /*
     * If the argument is an Express (or an Express-type) app,
     * assign it to the `app` variable.
     */
    if(isExpressApp(arg)) {
      app = arg;
    } else if(typeof arg === "function") {
      mapActionToHandler = arg;
    }
  } else if(args.length > 1) {
    [app, mapActionToHandler] = args;
  }

  class Router {
    constructor() {
      /*
       * Optional Express app instance.
       * If passed, routing is done immediately.
       */
      this.app = app;

      /*
       * List of endpoints
       */
      this.uris = [];

      /*
       * Registered middlewares
       */
      this.middlewares = [];

      /*
       * Route names
       */
      this.names = [];

      /*
       * Route (regex) patterns
       */
      this.patterns = [];

      /*
       * Extra meta data
       */
      this.metas = [];

      /*
       * Are we supporting lazy routing (true) or not (false).
       * For non-Express apps, we create the routes but
       * delay actual routing and call the apply() method
       * to perform the routing.
       */
      this.lazyRoute = isExpressApp(app) ? false : true;

      /*
       * Aggregates every created route.
       */
      this.routes = [];

      /*
       * Aggregates route groups created using the group() method.
       */
      this.routeGroups = [];
    }

    /**
     * Route (map) a request to a handler(s).
     *
     * @param {Object|String} options
     * @param {*} action
     * @return {Router}
     */
    route(options, action) {
      if(typeof options === "string" || options instanceof String) {
        options = { uri: options };
      }

      const routeOptions = Object.assign({}, defaultRouteOptions, options);

      routeOptions.method = routeOptions.method.toLowerCase();

      //const uri = path.join.apply(null, this.uris.concat(`/${routeOptions.uri}`));
      const uri = path.join.apply(null, this.uris.concat(`${routeOptions.uri}`)).replace(BACKSLASH_REGEX, "/");
      const middleware = this.middlewares.concat(routeOptions.middleware);
      const name = this.names.concat(routeOptions.name).join("");
      const patterns = Object.assign.apply(null, [{}].concat(this.patterns, routeOptions.patterns));
      const meta = Object.assign.apply(null, [{}].concat(this.metas, routeOptions.meta));

      const stack = middleware.concat(mapActionToHandler(action, {
        uri,
        middleware,
        name,
        patterns,
        meta
      }, routeOptions));

      if(routeOptions.name) {
        namedUrls[name] = {
          uri,
          patterns
        };
      }

      /*
       * If an Express (or Express-type) app is passed to createRouter(),
       * then we immediately apply routing and set lazyRoute to false
       */
      if(isExpressApp(app)) {
        app[routeOptions.method](laravelToExpress(uri, patterns), stack);
        this.lazyRoute = false;
      }

      /*
       * Add the current route data to the this.routes array.
       * This will be used later by the apply() method
       * for lazy routing of non-Express apps.
       */
      this.routes.push({
        method: routeOptions.method,
        path: laravelToExpress(uri, patterns),
        handlers: stack,
      });

      return this;
    }

    /**
     *
     * @param {Object|String} options
     * @param {Function} closure
     * @return {Router}
     */
    group(options, closure) {
      if(typeof options === "string" || options instanceof String) {
        options = {
          prefix: options
        };
      }

      const groupOptions = Object.assign({}, defaultGroupOptions, options);
      const router = new this.constructor(this);

      //router.uris = this.uris.concat(`/${groupOptions.prefix}`);
      router.uris = this.uris.concat(`${groupOptions.prefix}`).map(uri => uri.replace(BACKSLASH_REGEX, "/"));
      router.middlewares = this.middlewares.concat(groupOptions.middleware);
      router.names = this.names.concat(groupOptions.namespace);
      router.patterns = this.patterns.concat(groupOptions.patterns);
      router.metas = this.metas.concat(groupOptions.meta);

      /*
       * Push the router to the this.routeGroups array
       * to be used later by the apply() method for lazy routing
       */
      this.routeGroups.push(router);

      if(!Proxy) {
        closure(router);
        return this;
      }

      closure(new Proxy(router, proxy));

      return this;
    }

    /**
     *
     * @param {string} uri
     * @param staticMiddleware
     * @return {Router}
     */
    serve(uri, staticMiddleware) {
      const url = path.join.apply(null, this.uris.concat(uri));
      const patterns = Object.assign.apply(null, [{}].concat(this.patterns));
      const stack = this.middlewares.concat(staticMiddleware);

      /*
       * If an Express (or Express-type) app is passed to createRouter(),
       * then we immediately apply routing and set lazyRoute to false
       */
      if(isExpressApp(app)) {
        app.use(laravelToExpress(url, patterns), stack);
        this.lazyRoute = true;
      }

      /*
       * Add the current route data to the this.routes array.
       * This will be used later by the apply() method
       * for lazy routing of non-Express apps.
       */
      this.routes.push({
        method: "get",
        path: laravelToExpress(url, patterns),
        handlers: stack,
      });

      return this;
    }

    /**
     *
     * @param {String} name
     * @param {Object} params
     * @param {Object} options
     * @return {String}
     */
    url(name, params = {}, options = {}) {
      const namedUrl = namedUrls[name];

      if(!namedUrl) {
        throw new Error(`No URL found for  "${name}"`);
      }

      const { uri, patterns } = namedUrl;

      return uriWithParams({ uri, params, patterns, options });
    }

    /**
     * Perform lazy (delayed) app-specific routing for non-Express apps.
     *
     * @param {Function} routingFn: The app specific routing function
     * The function receives an object with the  following members:
     *    - {String} method: the request method
     *    - {String} path: the request path
     *    - {Array} handlers: a list of the app-specific request handlers
     *      added to the Router object using one of the routing methods.
     */
    apply(routingFn) {
      if(!this.lazyRoute) {
        return;
      }

      this.routes.forEach(route => routingFn(route));

      /*
       * Apply the routing to route groups created using route.group()
       */
      this.routeGroups.forEach(router => router.apply.call(router, routingFn));
    }
  }

  const router = new Router();

  if(!Proxy) {
    return router;
  }

  return new Proxy(router, proxy);
};
