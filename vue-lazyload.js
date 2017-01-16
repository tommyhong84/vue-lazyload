import util from 'util'

const inBrowser = typeof window !== 'undefined'
let parentEls = []

if (!Array.prototype.$remove) {
  Object.defineProperty(Array.prototype, '$remove', {
    value: function (item) {
      if (!this.length) return
      const index = this.indexOf(item)
      if (index > -1) {
        return this.splice(index, 1)
      }
    },
    writable: false,
    enumerable: false,
    configurable: false
  })
}

export default (Vue, Options = {}) => {
  const isVueNext = Vue.version.split('.')[0] === '2'
  const DEFAULT_URL = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='
  const ListenEvents = ['scroll', 'wheel', 'mousewheel', 'resize', 'animationend', 'transitionend']

  const Init = {
    preLoad: Options.preLoad || 1.3,
    error: Options.error || DEFAULT_URL,
    loading: Options.loading || DEFAULT_URL,
    attempt: Options.attempt || 3,
    scale: Options.scale || inBrowser ? window.devicePixelRatio : 1,
    hasbind: false
  }

  const Listeners = []
  const imageCache = []

  const throttle = function (action, delay) {
    let timeout = null
    let lastRun = 0
    return function () {
      if (timeout) {
        return
      }
      let elapsed = Date.now() - lastRun
      let context = this
      let args = arguments
      let runCallback = function () {
        lastRun = Date.now()
        timeout = false
        action.apply(context, args)
      }
      if (elapsed >= delay) {
        runCallback()
      }
      else {
        timeout = setTimeout(runCallback, delay)
      }
    }
  }

  const _ = {
    on(el, type, func) {
      el.addEventListener(type, func)
    },
    off(el, type, func) {
      el.removeEventListener(type, func)
    }
  }

  const lazyLoadHandler = throttle(() => {
    for (let key in Listeners) {
      checkCanShow(Listeners[key])
    }
  }, 300)

  // 增加 @param event 只绑定指定的事件
  const onListen = (el, start, event) => {
    if (start) {
      if (event) {
        return _.on(el, event, lazyLoadHandler)
      }
      return ListenEvents.forEach((evt) => {
        _.on(el, evt, lazyLoadHandler)
      })
    }
    Init.hasbind = false
    if (event) {
      return _.off(el, event, lazyLoadHandler)
    }
    return ListenEvents.forEach((evt) => {
      _.off(el, evt, lazyLoadHandler)
    })
  }

  const checkCanShow = (listener) => {
    if (imageCache.indexOf(listener.src) > -1) {
      Listeners.$remove(listener)
      return setElRender(listener.el, listener.bindType, listener.src, 'loaded')
    }
    let rect = listener.el.getBoundingClientRect()

    if ((rect.top < window.innerHeight * Init.preLoad && rect.bottom > 0) && (rect.left < window.innerWidth * Init.preLoad && rect.right > 0)) {
      render(listener)
    }
  }

  const setElRender = (el, bindType, src, state) => {
    if (!bindType) {
      if (el.src !== src) {
        el.setAttribute('src', '')
      }
      el.setAttribute('src', src)
    } else {
      el.setAttribute('style', bindType + ': url(' + src + ')')
    }
    el.setAttribute('lazy', state)
  }


  const render = (item) => {
    if (item.attempt >= Init.attempt) return false

    item.attempt++

    const resolve = (image) => {
      setElRender(item.el, item.bindType, item.src, 'loaded')
      imageCache.push(item.src)
      Listeners.$remove(item)
    }

    const reject = (error) => {
      setElRender(item.el, item.bindType, item.error, 'error')
      Listeners.$remove(item)
      _.on(item.el, 'click', function (e) {
        e.stopPropagation()
        setElRender(item.el, item.bindType, Options.loading || DEFAULT_URL, 'loading')
        _.off(item.el, 'click')
        loadImageAsync(item, resolve, reject)
      })
    }

    loadImageAsync(item, resolve, reject)
  }

  const loadImageAsync = (item, resolve, reject) => {

    let image = new Image()
    image.src = item.src

    image.onload = function () {
      resolve({
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
        src: item.src
      })
    }

    image.onerror = function (e) {
      reject(e)
    }
  }

  const componentWillUnmount = (el, binding, vnode, OldVnode) => {
    if (!el) return

    for (let i = 0, len = Listeners.length; i < len; i++) {
      if (Listeners[i] && Listeners[i].el === el) {
        Listeners.splice(i, 1)
      }
    }

    let parentEl = null

    if (binding.modifiers) {
      parentEl = util.up(el, `[data-${Object.keys(binding.modifiers)[0]}]`)// window.document.getElementById(Object.keys(binding.modifiers)[0])
    }

    if (parentEl) {
      onListen(parentEl, false, 'scroll')
      parentEls.$remove(parentEl)
    }

    if (Init.hasbind && Listeners.length == 0) {
      onListen(window, false)
    }
  }

  const checkElExist = (el) => {
    let hasIt = false

    Listeners.forEach((item) => {
      if (item.el === el) hasIt = true
    })

    if (hasIt) {
      return Vue.nextTick(() => {
        lazyLoadHandler()
      })
    }
    return hasIt
  }

  const addListener = (el, binding, vnode) => {
    if (~(['error', 'loaded'].indexOf(el.getAttribute('lazy'))) && (binding.oldValue === binding.value) && el.src === binding.value) {
      return
    }
    if (checkElExist(el)) return

    let parentEl = null
    let imageSrc = binding.value
    let imageLoading = Init.loading
    let imageError = Init.error

    if (typeof (binding.value) !== 'string' && binding.value) {
      imageSrc = binding.value.src
      imageLoading = binding.value.loading || Init.loading
      imageError = binding.value.error || Init.error
    }

    if (imageCache.indexOf(imageSrc) > -1) return setElRender(el, binding.arg, imageSrc, 'loaded')

    setElRender(el, binding.arg, imageLoading, 'loading')

    Vue.nextTick(() => {
      if (binding.modifiers) {
        parentEl = util.up(el, `[data-${Object.keys(binding.modifiers)[0]}]`)// window.document.getElementById(Object.keys(binding.modifiers)[0])
      }

      Listeners.push({
        bindType: binding.arg,
        attempt: 0,
        parentEl: parentEl,
        el: el,
        error: imageError,
        src: imageSrc
      })
      lazyLoadHandler()

      if (Listeners.length > 0 && !Init.hasbind) {
        Init.hasbind = true
        onListen(window, true)
        if (parentEl && !~parentEls.indexOf(parentEl)) {
          parentEls.push(parentEl)
          onListen(parentEl, true, 'scroll')
        }
      }
    })
  }

  if (isVueNext) {
    Vue.directive('lazy', {
      bind: addListener,
      update: addListener,
      inserted: addListener,
      componentUpdated: lazyLoadHandler,
      unbind: componentWillUnmount
    })
  } else {
    Vue.directive('lazy', {
      bind: lazyLoadHandler,
      update(newValue, oldValue) {
        addListener(this.el, {
          modifiers: this.modifiers,
          arg: this.arg,
          value: newValue,
          oldValue: oldValue
        })
      },
      unbind() {
        componentWillUnmount(this.el)
      }
    })
  }
}
