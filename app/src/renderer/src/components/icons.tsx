// One icon set everywhere: Phosphor (https://phosphoricons.com, MIT), behind the same small `Icon` API every screen
// already uses. `stroke` maps to Phosphor's weights (1.5 regular, 2 and up bold); the play mark is filled.
import {
  ArrowLeft,
  ArrowSquareOut,
  Binoculars,
  BookmarkSimple,
  CaretRight,
  ChartLineUp,
  ChatCircle,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  DotsThree,
  Eye,
  FilmStrip,
  Folder,
  GearSix,
  Heart,
  Image,
  InstagramLogo,
  LinkSimple,
  MagicWand,
  MusicNotes,
  Paperclip,
  PaperPlaneTilt,
  Pause,
  PenNib,
  PencilSimple,
  Play,
  Plus,
  Pulse,
  Scissors,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  Stack,
  TextT,
  Trash,
  UploadSimple,
  VideoCamera,
  X,
  type Icon as PhosphorIcon,
  type IconWeight
} from '@phosphor-icons/react'

const ICONS = {
  play: Play,
  pause: Pause,
  film: FilmStrip,
  folder: Folder,
  sparkles: Sparkle,
  settings: GearSix,
  pen: PenNib,
  studio: MagicWand,
  check: Check,
  x: X,
  more: DotsThree,
  upload: UploadSimple,
  volume: SpeakerHigh,
  mute: SpeakerSlash,
  back: ArrowLeft,
  music: MusicNotes,
  image: Image,
  video: VideoCamera,
  done: CheckCircle,
  instagram: InstagramLogo,
  heart: Heart,
  comment: ChatCircle,
  send: PaperPlaneTilt,
  bookmark: BookmarkSimple,
  plus: Plus,
  trash: Trash,
  pencil: PencilSimple,
  eye: Eye,
  original: ClockCounterClockwise,
  external: ArrowSquareOut,
  copy: Copy,
  scissors: Scissors,
  paperclip: Paperclip,
  type: TextT,
  // the screens that make the background visible
  insights: ChartLineUp,
  engine: Stack,
  health: Pulse,
  study: Binoculars,
  chevron: CaretRight,
  link: LinkSimple
} satisfies Record<string, PhosphorIcon>

export type IconName = keyof typeof ICONS

const FILLED = new Set<IconName>(['play', 'pause'])

const weightOf = (name: IconName, stroke: number): IconWeight => (FILLED.has(name) ? 'fill' : stroke >= 2 ? 'bold' : 'regular')

export function Icon({ name, size = 18, stroke = 1.5, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  const Glyph = ICONS[name]
  return <Glyph className={`icon${className ? ` ${className}` : ''}`} size={size} weight={weightOf(name, stroke)} aria-hidden />
}
