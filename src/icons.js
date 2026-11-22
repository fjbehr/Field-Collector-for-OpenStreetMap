// SVG icons (Lucide, ISC licence – https://lucide.dev). Only the icons
// imported here end up in the app bundle; they work fully offline.
import {
  ArrowLeft, BriefcaseMedical, Castle, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck,
  CircleHelp, CloudOff, CloudUpload, Coffee, Droplet, Ellipsis, EllipsisVertical, Eye, EyeOff,
  Factory, Fence, Folder, FolderOpen, FolderPlus, Footprints, GraduationCap, HandHeart, HardDriveDownload,
  House, Info, Landmark, Layers, List, LocateFixed, LogIn, LogOut, Mail, MapPin, MapPinned, Minus,
  Move, Pause, PenLine, Pentagon, Play, Plus, Route, Satellite, Search, Settings, Share2, Signpost,
  Spline, Store, Tags, Trash2, Trees, Trophy, Undo2, Waves, Wheat, X, Zap, Crosshair, Download,
  Star, History, Camera, ImagePlus, ScanQrCode, QrCode, FileUp, Magnet, SquarePen, ClipboardList, ChevronLeft,
  Sun, Moon, SunMoon, Lightbulb, FileArchive,
} from 'lucide';

const ICONS = {
  'arrow-left': ArrowLeft, 'check': Check, 'chevron-down': ChevronDown, 'chevron-right': ChevronRight,
  'alert': CircleAlert, 'check-circle': CircleCheck, 'help': CircleHelp, 'offline': CloudOff,
  'upload': CloudUpload, 'more': EllipsisVertical, 'ellipsis': Ellipsis, 'eye': Eye, 'eye-off': EyeOff,
  'folder': Folder, 'folder-open': FolderOpen, 'folder-plus': FolderPlus, 'walk': Footprints,
  'download': Download, 'save-phone': HardDriveDownload, 'info': Info, 'layers': Layers, 'list': List,
  'locate': LocateFixed, 'login': LogIn, 'logout': LogOut, 'mail': Mail, 'point': MapPin,
  'map-pinned': MapPinned, 'minus': Minus, 'move': Move, 'pause': Pause, 'pen': PenLine,
  'area': Pentagon, 'play': Play, 'plus': Plus, 'way': Route, 'gps': Satellite, 'search': Search,
  'settings': Settings, 'share': Share2, 'line': Spline, 'tags': Tags, 'trash': Trash2, 'undo': Undo2,
  'x': X, 'crosshair': Crosshair, 'star': Star, 'history': History, 'camera': Camera, 'image-plus': ImagePlus,
  'scan': ScanQrCode, 'qr': QrCode, 'file-up': FileUp, 'snap': Magnet, 'edit': SquarePen, 'form': ClipboardList,
  'chevron-left': ChevronLeft, 'sun': Sun, 'moon': Moon, 'sun-moon': SunMoon, 'tip': Lightbulb, 'zip': FileArchive,
};

// Icon per preset category (used in the preset picker, list and map markers).
export const CATEGORY_ICONS = {
  'Water & sanitation': Droplet,
  'Health': BriefcaseMedical,
  'Education': GraduationCap,
  'Community & government': Landmark,
  'Religion': HandHeart,
  'Shops & trade': Store,
  'Food, drink & tourism': Coffee,
  'Leisure & sport': Trophy,
  'Roads & paths': Signpost,
  'Buildings': House,
  'Land use & agriculture': Wheat,
  'Nature': Trees,
  'Waterways': Waves,
  'Barriers': Fence,
  'Power & telecoms': Zap,
  'Man made': Factory,
  'Places': MapPinned,
  'Historic & emergency': Castle,
};

function svg(node, cls = '') {
  const inner = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  return `<svg class="i ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// icon('point') → '<svg …>'
export function icon(name, cls = '') {
  const node = ICONS[name];
  if (!node) { console.warn('unknown icon', name); return ''; }
  return svg(node, cls);
}

export function categoryIcon(category, cls = '') {
  return svg(CATEGORY_ICONS[category] || MapPin, cls);
}

// Replace <i data-icon="name"></i> placeholders (used in index.html).
export function renderIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) {
    el.outerHTML = icon(el.dataset.icon, el.className);
  }
}
