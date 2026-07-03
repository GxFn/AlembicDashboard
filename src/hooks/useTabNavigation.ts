import { useEffect, useState } from 'react';
import { TabType, validTabs } from '../constants';

/**
 * useTabNavigation — tab 状态 + URL path 持久化 + popstate 回退监听
 * （W7-e 自 App.tsx 搬出；决策项②，layer-contract 已回写 hooks→constants 运行时边）。
 *
 * 边界（底稿 D2 ⑤）：只收编 navigateToTab 族的 pushState；recipe 编辑深链的
 * pushState/replaceState（openRecipeEdit/closeRecipeEdit）属 recipe 族留在 App，
 * `?action=search|create` 深链解析（耦合 createModal/searchAction 状态）也留在 App。
 * tab id 与 URL path 串是 wire 冻结面（底稿 0b），本 hook 原样搬运不改。
 */
export function useTabNavigation() {
  const getTabFromPath = (): TabType => {
    const path = window.location.pathname.replace(/^\//, '').split('/')[0] || '';
    return (validTabs as readonly string[]).includes(path) ? (path as TabType) : 'help';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getTabFromPath());

  // 初始挂载时与 URL 对齐（与原 App.tsx :334-336 行为一致）
  useEffect(() => {
    setActiveTab(getTabFromPath());
  }, []);

  // 浏览器前进/后退 → tab 状态回放
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Navigation
  const navigateToTab = (tab: TabType, options?: { preserveSearch?: boolean; search?: string }) => {
    setActiveTab(tab);
    const explicitSearch = options?.search
      ? (options.search.startsWith('?') ? options.search : `?${options.search}`)
      : '';
    const search = explicitSearch || (options?.preserveSearch && window.location.search ? window.location.search : '');
    window.history.pushState({}, document.title, `/${tab}${search}`);
  };

  return { activeTab, setActiveTab, navigateToTab };
}
