import React, { Component, Fragment } from 'react'
import PropTypes from 'prop-types'
import { Route } from 'react-router-dom'

import CacheComponent, { isMatch } from '../core/CacheComponent'
import Updatable from '../core/Updatable'
import { run, isExist, isNumber, clamp, isFunction } from '../helpers'
import { dropByCacheKey } from '../core/manager';

const isEmptyChildren = children => React.Children.count(children) === 0
const isFragmentable = isExist(Fragment)

export default class CacheRoute extends Component {
  static componentName = 'CacheRoute'

  static propTypes = {
    component: PropTypes.elementType || PropTypes.any,
    render: PropTypes.func,
    children: PropTypes.oneOfType([PropTypes.func, PropTypes.node]),
    computedMatchForCacheRoute: PropTypes.object,
    multiple: PropTypes.oneOfType([PropTypes.bool, PropTypes.number])
  }

  static defaultProps = {
    multiple: false
  }

  history = undefined;
  disposers = [];
  cache = {}
  prevPathname
  nextPathname

  constructor(props) {
    super(props);
    const { history, multiple, path, when, cacheKeyHook } = props;
    this.history = history;
    if (multiple && history) {
      const curCacheKey = cacheKeyHook ? cacheKeyHook(path, { ...this.props, history: { action, location } }) : path;
      const renderSingle = props => {
        const { component, render, children } = this.props;
        return (
          <CacheComponent {...props}>
            {cacheLifecycles => (
              <Updatable when={isMatch(props.match)}>
                {() => {
                  Object.assign(props, { cacheLifecycles })

                  if (component) {
                    return React.createElement(component, props)
                  }

                  return run(render || children, undefined, props)
                }}
              </Updatable>
            )}
          </CacheComponent>
        )
      }

      this.cache[curCacheKey] = [
        {
          updateTime: Date.now(),
          render: renderSingle
        }
      ];
      this.prevPathname = history.location.pathname;
      this.nextPathname = this.prevPathname;

      const disposer = history.listen((location, action) => {
        console.log('location pathname', action, location.pathname, window.location.pathname, history.location.pathname)
        this.prevPathname = this.nextPathname;
        this.nextPathname = location.pathname;
        const { cacheKeyHook } = this.props;
        const shouldCached = this.shouldCache(action, when, { ...this.props, history: { action, location } });

        if (this.nextPathname === path ) {
          if (shouldCached || action === "REPLACE") {
            const curCacheKey = cacheKeyHook ? cacheKeyHook(this.nextPathname, { ...this.props, history: { action, location } }) : this.nextPathname;
            if (path === '/') {
              this.cache[curCacheKey].forEach(item => {
                dropByCacheKey(`${curCacheKey}__${item.updateTime}`)
              })
              this.cache[curCacheKey] = []
            }
            this.cache[curCacheKey] = [
              {
                updateTime: Date.now(),
                render: renderSingle
              }
            ].concat(this.cache[curCacheKey] || [])
            if (path === '/') {
              this.forceUpdate();
            }
          }
        } else if (this.prevPathname === path) {
          if (!shouldCached || action === "REPLACE") {
            const curCacheKey = cacheKeyHook ? cacheKeyHook(this.prevPathname, { ...this.props, history: { action, location } }) : this.prevPathname;
            if (this.cache[curCacheKey] ) {
              this.cache[curCacheKey].shift()
            }
          }
        }


        switch (action) {
          case 'PUSH':
              console.log('hugo history push');
              break;
          case 'POP':
              console.log('hugo history pop');
              break;
          case 'REPLACE':
              console.log('hugo history replace');
              break;
          default:
              console.log(`hugo history action: ${action}`);
              break;
        }

      });
      this.disposers.push(disposer);
    }
    // todo: 手动match focus flur
  }

  componentWillUnmount() {
    this.disposers.forEach(disposer => disposer && disposer())
  }

  render() {
    let {
      children,
      render,
      component,
      className,
      when,
      behavior,
      cacheKey,
      cacheKeyHook,
      unmount,
      saveScrollPosition,
      computedMatchForCacheRoute,
      multiple,
      ...restProps
    } = this.props

    /**
     * Note:
     * If children prop is a React Element, define the corresponding wrapper component for supporting multiple children
     *
     * 说明：如果 children 属性是 React Element 则定义对应的包裹组件以支持多个子组件
     */
    if (React.isValidElement(children) || !isEmptyChildren(children)) {
      render = () => children
    }

    if (computedMatchForCacheRoute) {
      restProps.computedMatch = computedMatchForCacheRoute
    }

    if (multiple && !isFragmentable) {
      multiple = false
    }

    if (isNumber(multiple)) {
      multiple = clamp(multiple, 1)
    }

    return (
      /**
       * Only children prop of Route can help to control rendering behavior
       * 只有 Router 的 children 属性有助于主动控制渲染行为
       */
      <Route {...restProps}>
        {props => {
          const { match, computedMatch, location } = props
          const isMatchCurrentRoute = isMatch(props.match)
          const { pathname: currentPathname } = location
          const maxMultipleCount = isNumber(multiple) ? multiple : Infinity
          const configProps = {
            when,
            className,
            behavior,
            cacheKey,
            unmount,
            saveScrollPosition
          }

          const renderSingle = props => (
            <CacheComponent {...props}>
              {cacheLifecycles => (
                <Updatable when={isMatch(props.match)}>
                  {() => {
                    Object.assign(props, { cacheLifecycles })

                    if (component) {
                      return React.createElement(component, props)
                    }

                    return run(render || children, undefined, props)
                  }}
                </Updatable>
              )}
            </CacheComponent>
          )

          const { action } = props.history || {};
          const curCacheKey = cacheKeyHook ? cacheKeyHook(currentPathname, props) : currentPathname;
          // if (multiple && isMatchCurrentRoute) {
          //   if (!this.cache[curCacheKey]) {
          //     this.cache[curCacheKey] = [
          //       {
          //         updateTime: Date.now(),
          //         render: renderSingle
          //       }
          //     ]
          //   }
          // }
          /* if (multiple && isMatchCurrentRoute) {
            // todo: when or default when to new or del or replace
            const shouldCached = this.shouldCache(action, when, { ...props, ...configProps });
            if (shouldCached || action === 'REPLACE') {
              this.cache[curCacheKey] = [
                {
                  updateTime: Date.now(),
                  render: renderSingle
                }
              ]
                .concat(this.cache[curCacheKey])
                .filter(v => v)
                // .concat()
            } else {
              // if (!shouldCached) {
              //   if (this.cache[curCacheKey]) {
              //     this.cache[curCacheKey].pop();
              //   }
              // }
            }

            const legalCache = Object.entries(this.cache).reduce((acc, cur) => {
              acc = acc.concat((cur[1] || []).map(item => [cur[0], item]));
              return acc;
            }, [])
              // N.B: sort DESC by updateTime
              .sort(([, prev], [, next]) => next.updateTime - prev.updateTime)
              .reduce((acc, [pathname, item], idx) => {
                if (idx < maxMultipleCount) {
                  acc.push([pathname, item]);
                }
                return acc;
              }, [])
              .reduce((acc, [pathname, item]) => {
                if (!acc[pathname]) {
                  acc[pathname] = []
                };
                acc[pathname].push(item);
                return acc;
              }, {});

              this.cache = legalCache;
          } */



          //   this.cache[curCacheKey] = {
          //     updateTime: Date.now(),
          //     render: renderSingle
          //   }

          //   Object.entries(this.cache)
          //     .sort(([, prev], [, next]) => next.updateTime - prev.updateTime)
          //     .forEach(([pathname], idx) => {
          //       if (idx >= maxMultipleCount) {
          //         delete this.cache[pathname]
          //       }
          //     })
          // }

          return multiple ? (
            <Fragment>
              {
              Object.entries(this.cache)
              .reduce((acc, cur) => {
                acc = acc.concat((cur[1] || []).map(item => [cur[0], item]));
                return acc;
              }, [])
              .map((item) => {
                const [pathname, { render, updateTime }] = item;
                const curCacheKey = cacheKeyHook ? cacheKeyHook(currentPathname, props) : currentPathname;

                let recomputedMatch =
                  pathname === curCacheKey ? match || computedMatch : null;
                const cachedComps = this.cache[pathname].slice();

                if (recomputedMatch) {
                  if (item[1] !== cachedComps[0]) {
                    recomputedMatch = false;
                  }
                }

                const cacheId = `${cacheKey}__${updateTime}`;

                return (
                  <Fragment key={cacheId}>
                    {render({
                      ...props,
                      ...configProps,
                      cacheKey: cacheKey
                        ? {
                            cacheKey: cacheId,
                            pathname,
                            multiple: true
                          }
                        : undefined,
                      key: cacheId,
                      match: recomputedMatch
                    })}
                  </Fragment>
                )
              })}
            </Fragment>
          ) : (
            renderSingle({ ...props, ...configProps })
          )
        }}
      </Route>
    )
  }

  shouldCache = (action, when, props) => {
    let __cancel__cache = false;
    if (isFunction(when)) {
      __cancel__cache = !when(props)
    } else {
      switch (when) {
        case 'always':
          break
        case 'back':
          if (['PUSH', 'REPLACE'].includes(action)) {
            __cancel__cache = true
          }

          break
        case 'forward':
        default:
          if (action === 'POP') {
            __cancel__cache = true
          }
      }
    }
    return !__cancel__cache;
  }
}
