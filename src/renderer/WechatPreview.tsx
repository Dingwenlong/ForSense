import type { Draft, MediaAsset } from '../shared/types';

function SettingIcon({ kind }: { kind: 'location' | 'mention' | 'audience' }) {
  if (kind === 'mention') return <span className="wechat-proof__at" aria-hidden="true">@</span>;
  return <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'location' ? <><path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/></>
      : <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1.5a7 7 0 0 1 14 0V21H5Z"/></>}
  </svg>;
}

export function WechatPreview({ draft, onView }: { draft: Draft; onView: (asset: MediaAsset) => void }) {
  return <div className="wechat-proof" aria-label="微信朋友圈发表排版预览">
    <div className="wechat-proof__header" aria-label="发表栏示意">
      <span>取消</span><span className="wechat-proof__publish">发表</span>
    </div>
    <p className={`layout-caption wechat-proof__caption ${draft.caption ? '' : 'wechat-proof__placeholder'}`}>
      {draft.caption || '这一刻的想法…'}
    </p>
    <div className="wechat-proof__photos" aria-label="朋友圈图片九宫格">
      {draft.items.length ? <div className="wechat-proof__grid">
        {draft.items.slice(0, 9).map((item, position) => <button key={item.id} className="preview-image wechat-proof__photo"
          onClick={() => onView(item)} aria-label={`查看第 ${position + 1} 张：${item.name}`}>
          <img src={item.imageUrl} alt={item.name}/>
          {item.kind === 'live' && <span className="wechat-proof__live">实况</span>}
        </button>)}
      </div> : <p className="wechat-proof__empty">（暂无图片）</p>}
      {draft.items.length > 9 && <p className="wechat-proof__overflow">九宫格预览前 9 张；草稿共 {draft.items.length} 张，导出保留全部素材。</p>}
    </div>
    <div className="wechat-proof__settings" aria-label="发布设置示意">
      <div className="wechat-proof__setting"><SettingIcon kind="location"/><span>所在位置</span><span className="wechat-proof__setting-value">微信中设置</span><span aria-hidden="true">›</span></div>
      <div className="wechat-proof__setting"><SettingIcon kind="mention"/><span>提醒谁看</span><span className="wechat-proof__setting-value">微信中设置</span><span aria-hidden="true">›</span></div>
      <div className="wechat-proof__setting"><SettingIcon kind="audience"/><span>谁可以看</span><span className="wechat-proof__setting-value">微信中设置</span><span aria-hidden="true">›</span></div>
    </div>
    <p className="wechat-proof__note">仅供排版参考；发表与设置需在微信中完成</p>
  </div>;
}
