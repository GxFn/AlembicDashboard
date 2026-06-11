import React from 'react';

/* ═══════════════════════════════════════════════════════════
 * PageOverlay — 全局遮罩容器
 *
 * ── z-index 层级规范 ──────────────────────────────────
 *
 *   Z_DROPDOWN (z-20)  Header 下拉菜单等页面内浮层
 *   Z_DRAWER   (z-30)  侧边抽屉（详情面板、搜索面板）
 *   Z_MODAL    (z-40)  居中弹窗（编辑器、创建、确认框）
 *   Z_TOAST    (z-50)  Toast 通知（react-hot-toast 默认 9999）
 *
 * 用法:
 *   <PageOverlay onClick={onClose} className={Z_DRAWER}>
 *     <PageOverlay.Backdrop />
 *     <div className="relative ...">  // 你的抽屉/弹窗内容
 *       ...
 *     </div>
 *   </PageOverlay>
 * ═══════════════════════════════════════════════════════════ */

/** z-index 层级常量 — 保持全局一致 */
export const Z_DROPDOWN = 'z-20';
export const Z_DRAWER   = 'z-30';
export const Z_MODAL    = 'z-40';
export const Z_TOAST    = 'z-50';

interface PageOverlayProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  /** 额外 style */
  style?: React.CSSProperties;
}

/** 蒙层背景 */
const Backdrop: React.FC<{ className?: string }> = ({ className = 'bg-black/20 backdrop-blur-[1px]' }) => (
  <div className={`absolute inset-0 ${className}`} />
);

const PageOverlay: React.FC<PageOverlayProps> & { Backdrop: typeof Backdrop } = ({
  children, onClick, className = '', style,
}) => {
  return (
    <div
      className={`fixed inset-0 overflow-hidden ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

PageOverlay.Backdrop = Backdrop;

export default PageOverlay;
