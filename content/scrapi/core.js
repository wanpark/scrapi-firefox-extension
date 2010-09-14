Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const log = Application.console.log;

// ========================================
// constants
// ========================================

const NS_SCRAPI = 'http://scrapi.jp/scrap/1.0#';

const UPLOAD_URL = 'http://www.scrapi.jp/scraps.json';
// const UPLOAD_URL = 'http://www.lscrapi.jp:3000/scraps.json';

const DATA_DIRNAME = 'scrapi';

const SCRAPS_RDF_FILENAME = 'scraps.rdf';
const SCRAPS_RESOURCE_NAME = 'urn:scrapi:scraps';

const SCRAP_RDF_BASENAME = 'scrap';
const SCRAP_LABEL_BASENAME = 'scrap';
const SCRAP_RESOURCE_BASENAME = 'urn:scrapi:scrap';

const SELECTED_SCRAP_CHANGE_KEY = 'scrapiSelectedScrapChange';
const SELECTED_ENTRY_CHANGE_KEY = 'scrapiSelectedEntryChange';
const ENTRY_REMOVE_KEY = 'scrapiEntryRemove';
const ENTRY_ADD_KEY = 'scrapiEntryAdd';
const ENTRY_MODIFY_KEY = 'scrapiEntryModify';
const ENTRY_LOAD_KEY = 'scrapiEntryLoad';

const DEFAULT_TWITTER_USER_IMAGE = 'http://s.twimg.com/a/1283564528/images/default_profile_4_normal.png';

const EMPTY_PROPERTY_INDEX = 0;
const LOADING_PROPERTY_INDEX = 1;
const ERROR_PROPERTY_INDEX = 2;
const TWITTER_PROPERTY_INDEX = 3;
const NICH_PROPERTY_INDEX = 4;
const TEXT_PROPERTY_INDEX = 5;

// ========================================
// utilities
// ========================================

var Scrapi = {

    bind: function(fn, bind) {
        return function() {
            return fn.apply(bind, arguments);
        };
    },

    extend: function(original, extended){
	for (var key in (extended || {})) original[key] = extended[key];
	return original;
    },

    capitalize: function(str) {
        return (str || '').replace(/^[a-z]/, function(c) c.toUpperCase());
    },
    
    getTimestamp : function(advance) {
        var dd = new Date;
        if (advance) dd.setTime(dd.getTime() + 1000 * advance);
        var y = dd.getFullYear();
        var m = dd.getMonth() + 1; if ( m < 10 ) m = "0" + m;
        var d = dd.getDate();      if ( d < 10 ) d = "0" + d;
        var h = dd.getHours();     if ( h < 10 ) h = "0" + h;
        var i = dd.getMinutes();   if ( i < 10 ) i = "0" + i;
        var s = dd.getSeconds();   if ( s < 10 ) s = "0" + s;
        return y.toString() + m.toString() + d.toString() + h.toString() + i.toString() + s.toString();
    },
    
    parseDate: function(str) {
        let time = Date.parse(str);
        if (isNaN(time)) return null;
        let date = new Date();
        date.setTime(time);
        return date;
    },

    clearChildNodes: function(node) {
        while (node.hasChildNodes()) {
            node.removeChild(node.firstChild);
        }
        return node;
    },
    
    parseInvalidJSON: function(str) {
        return JSON.parse(str.replace(/'/g, '"').replace(/([,\{])\s*(\w+)\s*:/gm, '$1"$2":'));
    },

    httpRequest: function(url, options) {
        let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
        request.QueryInterface(Ci.nsIDOMEventTarget);
        if (options.onload)
            request.addEventListener('load', options.onload, false);
        if (options.onerror)
            request.addEventListener('error', options.onerror, false);
        request.QueryInterface(Ci.nsIXMLHttpRequest);
        request.open(options.method || 'GET', url, true);
        let headers = options.headers || {};
        for (let key in headers) {
            request.setRequestHeader(key, headers[key]);
        }
        request.send(options.data || null);
    },

    
    getBrowser: function() {
        let eb = this.S.window.getEnumerator("navigator:browser");
        if (eb.hasMoreElements())
            return eb.getNext().QueryInterface(Components.interfaces.nsIDOMWindow).getBrowser();
        return null;
    },
    
    getActiveDocument: function() {
        let browser = this.getBrowser();
        if (browser) return browser.contentDocument;
        return null;
    },

    readFile: function(file) {
        let stream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Components.interfaces.nsIFileInputStream);
        try {
            stream.init(file, 1, 0, false); // open as "read only"
            let scriptableStream = Cc['@mozilla.org/scriptableinputstream;1'].createInstance(Ci.nsIScriptableInputStream);
            scriptableStream.init(stream);
            let fileSize = scriptableStream.available();
            let fileContents = scriptableStream.read(fileSize);
            scriptableStream.close();
            stream.close();
            return fileContents;
        } catch(e) {
            return null;
        }

    },

    get dataDir() {
        let dir = Scrapi.S.dir.get("ProfD", Ci.nsIFile);
        dir.append(DATA_DIRNAME);
        if (!dir.exists())
            dir.create(dir.DIRECTORY_TYPE, 0700);
        return dir;
    }
    
};


// ========================================
// service getters
// ========================================

Scrapi.S = {};
[
    ['io', '@mozilla.org/network/io-service;1', 'nsIIOService'],
    ['dir', '@mozilla.org/file/directory_service;1', 'nsIProperties'],
    ['rdf', '@mozilla.org/rdf/rdf-service;1', 'nsIRDFService'],
    ['rdfcu', '@mozilla.org/rdf/container-utils;1', 'nsIRDFContainerUtils'],
    ['observer', '@mozilla.org/observer-service;1', 'nsIObserverService'],
    ['window', '@mozilla.org/appshell/window-mediator;1', 'nsIWindowMediator'],
    ['uconv', '@mozilla.org/intl/scriptableunicodeconverter', 'nsIScriptableUnicodeConverter']
].forEach(function(service) {
    XPCOMUtils.defineLazyServiceGetter(Scrapi.S, service[0], service[1], service[2]);
});


// ========================================
// event handling
// ========================================

Scrapi.Events = {
    listeners: {},
    addListener: function(type, listener) {
        (this.listeners[type] = this.listeners[type] || []).push(listener);
    },
    notify: function(type, obj) {
        if (!(type in this.listeners)) return;
        this.listeners[type].forEach(function(listener) {
            listener.call(Scrapi, obj);
        });
    },
    clear: function() {
        this.listeners = {};
    }
};



// ========================================
// seq container rdf object
// ========================================

Scrapi.RDF = function(file, containerResource) {
    this.createDataSource(file);
    this.createContainer(containerResource);
    this.containerResourceName = this.getString(containerResource);
};
Scrapi.RDF.prototype = {
    
    // ==========
    // rdf resource generators
    // ==========
    getResource: function(resource) {
        if (!(resource instanceof Ci.nsISupports))
            resource = Scrapi.S.rdf.GetResource(resource);
        return resource;
    },
    getLiteral: function(literal) {
        if (!(literal instanceof Ci.nsISupports))
            literal = Scrapi.S.rdf.GetLiteral(literal);
        return literal;
    },
    getString: function(resource) {
        if (resource instanceof Ci.nsISupports)
            resource = resource.QueryInterface(Ci.nsIRDFLiteral).Value;
        return String(resource || '');
    },
    appendResourceName: function(base, appended) {
        return base + ':' + appended;
    },
    getProperty: function(key) {
        if (!(key instanceof Ci.nsISupports))
            key = this.getResource(NS_SCRAPI + key);
        return key;
    },

    
    // ==========
    // setup
    // ==========
    createDataSource: function(file) {
        if (!file.exists()) file.create(file.NORMAL_FILE_TYPE, 0666);
        this.dataSource = Scrapi.S.rdf.GetDataSourceBlocking(
            Scrapi.S.io.newFileURI(file).spec
        );
    },
    createContainer: function(resource) {
        resource = this.getResource(resource);
        this.container = Cc['@mozilla.org/rdf/container;1'].createInstance(Ci.nsIRDFContainer);
        try {
            this.container.Init(this.dataSource, resource);
        } catch(e) {
            this.container = Scrapi.S.rdfcu.MakeSeq(this.dataSource, resource);
        }
    },

    reloadContainer: function() {
        this.container = Cc['@mozilla.org/rdf/container;1'].createInstance(Ci.nsIRDFContainer);
        let resource =  this.getResource(this.containerResourceName);
        try {
            this.container.Init(this.dataSource, resource);
        } catch(e) {
            this.container = Scrapi.S.rdfcu.MakeSeq(this.dataSource, resource);
        }
    },

    
    // ==========
    // properties
    // ==========
    get length() {
        return this.container.GetCount();
    },

    getUniqueElementKey: function() {
        let advance = 0;
        while (true) {
            let key = Scrapi.getTimestamp(advance);
            if (!this.dataSource.ArcLabelsOut(this.getElementFor(key)).hasMoreElements())
                return key;
            advance++;
        }
    },


    // ==========
    // basic operations
    // ==========

    assert: function(res, prop, target) {
        this.dataSource.Assert(
            this.getResource(res), this.getProperty(prop), this.getLiteral(target), true
        );
    },
    unassert: function(res, prop, target) {
        this.dataSource.Unassert(
            this.getResource(res), this.getProperty(prop), this.getLiteral(target)
        );
    },


    getTargetValue: function(res, prop) {
        let target = this.dataSource.GetTarget(
            res, this.getProperty(prop), true
        );
        return this.getString(target);
    },
    
    flush: function() {
        this.dataSource.QueryInterface(Ci.nsIRDFRemoteDataSource).Flush();
        return this;
    },

    
    // ==========
    // container operations
    // ==========

    getElementAt: function(index) {
        if (index < -1 || index >= this.length) return null;
        let elements = this.container.GetElements();
        let res;
        let i = index;
        while (i-- >= 0) res = elements.getNext();
        return res;
    },

    getElementFor: function(key) {
        return this.getResource(this.appendResourceName(this.containerResourceName, key));
    },

    addElement: function(props) {
        return this.update(function() {
            let elementKey = this.getUniqueElementKey();
            let resource = this.getElementFor(elementKey);
            this.container.AppendElement(resource);
            this.addProperties(resource, props);
            return elementKey;
        });
    },
    insertElementAt: function(props, index) {
        if (index < 0 || index >= this.container.GetCount())
            return this.addElement(props);
        return this.update(function() {
            let elementKey = this.getUniqueElementKey();
            let resource = this.getElementFor(elementKey);
            this.container.InsertElementAt(resource, index + 1, true);
            this.addProperties(resource, props);
            return elementKey;
        });
    },
    addProperties: function(resource, props) {
        this.update(function() {
            resource = this.getResource(resource);
            for (let key in props) {
                if (props[key])
                    this.assert(resource, key, props[key]);
            }
        });
    },
    modifyProperty: function(resource, prop, value) {
        let resource = this.getResource(resource);
        let prop = this.getProperty(prop);
        let target = this.dataSource.GetTarget(resource, prop, true);
        if (target)
            this.unassert(resource, prop, target);
        if (value)
            this.assert(resource, prop, value);
    },


    removeElement: function(resource) {
        this.update(function() {
            resource = this.getResource(resource);
            this.container.RemoveElement(resource, true);
            this.removeProperties(resource);
        });
    },
    removeElementAt: function(index) {
        let res = this.getElementAt(index);
        if (res) this.removeElement(res);
    },

    removeProperties: function(resource) {
        this.update(function() {
            resource = this.getResource(resource);
            let props = this.dataSource.ArcLabelsOut(resource);
            while (props.hasMoreElements()) {
	        let prop  = props.getNext(); //.QueryInterface(Components.interfaces.nsIRDFResource);
	        let target = this.dataSource.GetTarget(resource, prop, true);
                this.dataSource.Unassert(resource, prop, target);
            }
        });
    },

    
    // ==========
    // transaction and notification
    // ==========
    
    updateNestCount: 0,
    skipUpdateBatch: false,
    waitingNotifications: {},
    
    beginUpdate: function() {
        if (this.updateNestCount++ == 0) {
            if (!this.skipUpdateBatch)
                this.dataSource.beginUpdateBatch();
        }
    },
    endUpdate: function() {
        if (--this.updateNestCount <= 0) {
            if (!this.skipUpdateBatch)
                this.dataSource.endUpdateBatch();
            this.flush();
            for (let key in this.waitingNotifications) {
                Scrapi.Events.notify(key, this.waitingNotifications[key]);
            }
            this.waitingNotifications = {};
            this.updateNestCount = 0;
        }
    },
    update: function(fn, bind) {
        this.beginUpdate();
        let result = fn.call(bind || this);
        this.endUpdate();
        return result;
    },
    
    // beginUpdateBatch/endUpdateBatch clear tree selections. to prevent that, call this method instead of update.
    updateWithoutBatch: function(fn, bind) {
        this.skipUpdateBatch = true;
        let result = this.update(fn, bind);
        this.skipUpdateBatch = false;
        return result;
    },

    notify: function(key, value) {
        if (this.updateNestCount > 0) {
            this.waitingNotifications[key] = value;
        } else {
            Scrapi.Events.notify(key, value);
        }
    }
};
