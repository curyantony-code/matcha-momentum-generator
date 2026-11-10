// The only bridge between the page and the main process. The page never sees Node or ipcRenderer.
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppCommand, JobEvent, ModelStatus, PhoneEvent, ProviderInfo, ReelApi, StoryProgress, UpdateNotice, VendorInfo } from '../shared/api'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as
    | { ok: true; value: T }
    | { ok: false; error: { code: string; userMessage: string } }
  if (r.ok) return r.value
  throw r.error
}

function on<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api: ReelApi = {
  app: {
    info: () => call('app:info'),
    finishFirstRun: () => call('app:finishFirstRun'),
    openFolder: (p) => call('app:openFolder', p),
    copyText: (t) => call('app:copyText', t),
    dimTitleBar: (on) => call('app:dimTitleBar', on),
    pathForFile: (f) => webUtils.getPathForFile(f),
    chooseFolder: () => call('app:chooseFolder'),
    setRoot: (p) => call('app:setRoot', p),
    onCommand: (cb) => on<AppCommand>('app:command', cb),
    startDrag: (file) => ipcRenderer.send('app:startDrag', file)
  },
  model: {
    status: () => call('model:status'),
    download: () => call('model:download'),
    cancel: () => call('model:cancel'),
    onProgress: (cb) => on<ModelStatus>('model:progress', cb)
  },
  ai: {
    providers: () => call('ai:providers'),
    active: () => call('ai:active'),
    setActive: (id, connectionId) => call('ai:setActive', id, connectionId),
    setClaudeKey: (k) => call('ai:setClaudeKey', k),
    claudeCodeStatus: () => call('ai:claudeCodeStatus'),
    openClaudeSignIn: () => call('ai:openClaudeSignIn'),
    connections: () => call('ai:connections'),
    saveConnection: (input) => call('ai:saveConnection', input),
    removeConnection: (id) => call('ai:removeConnection', id),
    setConnectionImages: (id, on) => call('ai:setConnectionImages', id, on),
    connectionModels: (q) => call('ai:connectionModels', q),
    onChange: (cb) => on<ProviderInfo>('ai:change', cb),
    vendorStatus: (v) => call('ai:vendorStatus', v),
    vendorConnect: (v) => call('ai:vendorConnect', v),
    vendorCancel: (v) => call('ai:vendorCancel', v),
    vendorSignInAgain: (v) => call('ai:vendorSignInAgain', v),
    onVendor: (cb) => on<VendorInfo>('ai:vendor', cb)
  },
  projects: {
    list: () => call('projects:list'),
    get: (slug) => call('projects:get', slug),
    create: (files, scriptId) => call('projects:create', files, scriptId),
    resume: (slug) => call('projects:resume', slug),
    note: (slug, text, attachments) => call('projects:note', slug, text, attachments),
    update: (slug, patch) => call('projects:update', slug, patch),
    rerender: (slug, change, label) => call('projects:rerender', slug, change, label),
    setFormat: (slug, format) => call('projects:setFormat', slug, format),
    exportVersion: (slug, n) => call('projects:export', slug, n),
    capcut: (slug) => call('projects:capcut', slug),
    openreel: (slug) => call('projects:openreel', slug),
    remove: (slug) => call('projects:remove', slug)
  },
  notes: {
    attachFiles: (slug, paths) => call('notes:attachFiles', slug, paths),
    attachData: (slug, file) => call('notes:attachData', slug, file),
    attachClipboard: (slug) => call('notes:attachClipboard', slug),
    choose: (slug) => call('notes:chooseAttachment', slug),
    remove: (slug, asset) => call('notes:removeAttachment', slug, asset)
  },
  jobs: {
    cancel: (id) => call('jobs:cancel', id),
    onEvent: (cb) => on<JobEvent>('job:event', cb)
  },
  phone: {
    start: (video, caption, address) => call('phone:start', video, caption, address),
    stop: () => call('phone:stop'),
    onEvent: (cb) => on<PhoneEvent>('phone:event', cb),
    emailSelf: (video) => call('phone:emailSelf', video),
    shareSheet: (video) => call('phone:shareSheet', video)
  },
  library: {
    list: () => call('library:list'),
    add: (paths) => call('library:add', paths),
    choose: (kind) => call('library:choose', kind)
  },
  style: {
    rules: () => call('style:rules'),
    add: (text) => call('style:add', text),
    update: (id, text) => call('style:update', id, text),
    remove: (id) => call('style:remove', id),
    answer: (slug, messageId, yes) => call('style:answer', slug, messageId, yes)
  },
  script: {
    write: (idea) => call('script:write', idea),
    list: () => call('script:list'),
    remove: (id) => call('script:remove', id),
    update: (id, patch) => call('script:update', id, patch),
    ideas: () => call('script:ideas'),
    setup: () => call('script:setup'),
    chooseVoice: () => call('script:chooseVoice'),
    setFormat: (format) => call('script:setFormat', format),
    setVideoFormat: (format) => call('script:setVideoFormat', format),
    setBeatTemplate: (id) => call('script:setBeatTemplate', id),
    saveBeatTemplate: (t) => call('script:saveBeatTemplate', t),
    removeBeatTemplate: (id) => call('script:removeBeatTemplate', id)
  },
  clips: {
    pick: (slug) => call('clips:pick', slug),
    make: (slug, picks) => call('clips:make', slug, picks)
  },
  repurpose: {
    load: (slug) => call('repurpose:load', slug),
    make: (slug) => call('repurpose:make', slug)
  },
  post: {
    adapt: (slug) => call('post:adapt', slug)
  },
  look: {
    default: () => call('look:default'),
    setDefault: (look) => call('look:setDefault', look),
    applyAll: () => call('look:applyAll'),
    templates: () => call('look:templates'),
    saveTemplate: (t) => call('look:saveTemplate', t),
    removeTemplate: (id) => call('look:removeTemplate', id),
    useTemplate: (id) => call('look:useTemplate', id),
    house: () => call('look:house'),
    setHouse: (slug) => call('look:setHouse', slug),
    clearHouse: () => call('look:clearHouse')
  },
  brands: {
    list: () => call('brands:list'),
    save: (id, base, edits) => call('brands:save', id, base, edits),
    reveal: (id) => call('brands:reveal', id),
    active: () => call('brands:active'),
    setActive: (id) => call('brands:setActive', id)
  },
  carousels: {
    list: () => call('carousels:list'),
    create: (title) => call('carousels:create', title),
    save: (c) => call('carousels:save', c),
    draft: (id, topic, slides) => call('carousels:draft', id, topic, slides),
    remove: (id) => call('carousels:remove', id),
    assets: (id) => call('carousels:assets', id),
    export: (id) => call('carousels:export', id),
    reveal: (id) => call('carousels:reveal', id)
  },
  stories: {
    list: () => call('stories:list'),
    create: (title) => call('stories:create', title),
    save: (st) => call('stories:save', st),
    remove: (id) => call('stories:remove', id),
    draft: (id, topic, lines) => call('stories:draft', id, topic, lines),
    assets: (id) => call('stories:assets', id),
    timing: (id) => call('stories:timing', id),
    audioUrl: (id) => call('stories:audioUrl', id),
    voiceModel: () => call('stories:voiceModel'),
    downloadVoiceModel: () => call('stories:downloadVoiceModel'),
    voices: () => call('stories:voices'),
    makeVoice: (id) => call('stories:makeVoice', id),
    useRecording: (id) => call('stories:useRecording', id),
    export: (id) => call('stories:export', id),
    reveal: (id) => call('stories:reveal', id),
    onProgress: (cb) => on<StoryProgress>('stories:progress', cb)
  },
  studio: {
    show: (bounds) => call('studio:show', bounds),
    hide: () => call('studio:hide'),
    reload: () => call('studio:reload'),
    openInBrowser: () => call('studio:openInBrowser'),
    exports: () => call('studio:exports')
  },
  results: {
    get: (slug) => call('results:get', slug),
    set: (slug, result) => call('results:set', slug, result),
    insights: () => call('results:insights')
  },
  storyboard: {
    get: (slug) => call('storyboard:get', slug),
    enabled: () => call('storyboard:enabled'),
    setEnabled: (on) => call('storyboard:setEnabled', on)
  },
  overview: {
    performance: () => call('overview:performance'),
    engine: () => call('overview:engine'),
    health: () => call('overview:health')
  },
  howMade: {
    get: (slug) => call('howMade:get', slug)
  },
  study: {
    list: () => call('study:list'),
    get: (id) => call('study:get', id),
    add: (text, opts) => call('study:add', text, opts),
    retry: (id) => call('study:retry', id),
    remove: (id) => call('study:remove', id),
    toConcept: (id) => call('study:toConcept', id),
    toTemplate: (id) => call('study:toTemplate', id),
    toResearch: (id) => call('study:toResearch', id),
    open: (url) => call('study:open', url),
    onChanged: (cb) => on('study:changed', cb)
  },
  theme: {
    get: () => call('theme:get'),
    set: (t) => call('theme:set', t)
  },
  motion: {
    enabled: () => call('motion:enabled'),
    setEnabled: (on) => call('motion:setEnabled', on)
  },
  maker: {
    tools: () => call('maker:tools'),
    make: (req) => call('maker:make', req)
  },
  publish: {
    status: () => call('publish:status'),
    send: (slug, req) => call('publish:send', slug, req)
  },
  dev: {
    renderTestAnimation: (out, full, template, params) => call('dev:renderTestAnimation', out, full, template, params)
  },
  update: {
    status: () => call('update:status'),
    setEnabled: (on) => call('update:setEnabled', on),
    open: (url) => call('update:open', url),
    dismiss: (version) => call('update:dismiss', version),
    onChange: (cb) => on<UpdateNotice | null>('update:change', cb)
  }
}

contextBridge.exposeInMainWorld('reel', api)
