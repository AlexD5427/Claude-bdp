import {
  type LucideIcon,
  AlertTriangle, Heading1, Heading2, Text, AlignLeft, Info, Megaphone, Minus,
  SeparatorHorizontal, Image, Video, Volume2, FileText, Type, TextCursor, Hash,
  Percent, DollarSign, Calendar, Clock, CalendarClock, CircleDot, ListChecks,
  ChevronDown, ListPlus, ToggleLeft, CircleHelp, BarChart2, Ruler, Star, Grid3x3,
  Grid2x2, Table, ArrowDownWideNarrow, ListOrdered, Link2, FolderTree, ImagePlus,
  MousePointerClick, BookOpen, Layers, LineChart, Upload, Code, Database, Sheet,
  Clapperboard, CreditCard, ShieldAlert, Calculator, GitCompare, Headphones, Cog,
  FileSpreadsheet, HelpCircle,
} from "lucide-react";

/** Map plugin icon names to Lucide components (with a safe fallback). */
const ICONS: Record<string, LucideIcon> = {
  AlertTriangle, Heading1, Heading2, Text, AlignLeft, Info, Megaphone, Minus,
  SeparatorHorizontal, Image, Video, Volume2, FileText, Type, TextCursor, Hash,
  Percent, DollarSign, Calendar, Clock, CalendarClock, CircleDot, ListChecks,
  ChevronDown, ListPlus, ToggleLeft, CircleHelp, BarChart2, Ruler, Star, Grid3x3,
  Grid2x2, Table, ArrowDownWideNarrow, ListOrdered, Link2, FolderTree, ImagePlus,
  MousePointerClick, BookOpen, Layers, LineChart, Upload, Code, Database, Sheet,
  Clapperboard, CreditCard, ShieldAlert, Calculator, GitCompare, Headphones, Cog,
  FileSpreadsheet,
};

export function pluginIcon(name: string): LucideIcon {
  return ICONS[name] ?? HelpCircle;
}
