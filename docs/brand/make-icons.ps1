# Иконки и знак «Мой вуз» из исходной картинки docs/brand/logo-source.jpg (T17, D57).
# Запуск из корня репозитория: pwsh -File docs/brand/make-icons.ps1
# Вывод: frontend/public/{favicon.ico, favicon-32.png, apple-touch-icon.png}, frontend/public/icons/icon-*.png,
#        frontend/public/brand/{mark-64.png, mark-128.png, building-outline.png}
param([string]$Root = (Resolve-Path "$PSScriptRoot/../..").Path)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$src = [System.Drawing.Bitmap]::FromFile("$Root/docs/brand/logo-source.jpg")
$navy = [System.Drawing.Color]::FromArgb(255, 0x01, 0x1F, 0x55)   # фон исходного знака
$public = "$Root/frontend/public"
New-Item -ItemType Directory -Force "$public/icons", "$public/brand" | Out-Null

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  return @($bmp, $g)
}
function Get-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); return $p
}
# Картинку (или её часть $crop) вписать в прямоугольник со скруглением: углы прозрачные и сглаженные
function Draw-Rounded($g, $image, [System.Drawing.RectangleF]$dest, [float]$radius, [System.Drawing.Rectangle]$crop) {
  $tmp = New-Object System.Drawing.Bitmap ([int]$dest.Width), ([int]$dest.Height)
  $tg = [System.Drawing.Graphics]::FromImage($tmp); $tg.InterpolationMode = 'HighQualityBicubic'; $tg.PixelOffsetMode = 'HighQuality'
  $tg.DrawImage($image, (New-Object System.Drawing.Rectangle 0, 0, $tmp.Width, $tmp.Height), $crop, 'Pixel'); $tg.Dispose()
  $brush = New-Object System.Drawing.TextureBrush $tmp
  $brush.TranslateTransform($dest.X, $dest.Y)
  $g.FillPath($brush, (Get-RoundedPath $dest.X $dest.Y $dest.Width $dest.Height $radius))
  $brush.Dispose(); $tmp.Dispose()
}
function Save($bmp, $path) { $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }

$full = New-Object System.Drawing.Rectangle 0, 0, $src.Width, $src.Height
$radiusShare = 0.21   # радиус скругления исходника ≈ 21 % стороны

# Белые углы исходника и светлую кайму скругления заливаем фирменным синим — иначе на сплошном фоне видна рамка
$srcR = 263; $margin = 8
foreach ($cx in $srcR, ($src.Width - 1 - $srcR)) {
  foreach ($cy in $srcR, ($src.Height - 1 - $srcR)) {
    $xs = if ($cx -lt $src.Width / 2) { 0..$cx } else { $cx..($src.Width - 1) }
    $ys = if ($cy -lt $src.Height / 2) { 0..$cy } else { $cy..($src.Height - 1) }
    foreach ($x in $xs) { foreach ($y in $ys) {
      if ([math]::Sqrt(($x - $cx) * ($x - $cx) + ($y - $cy) * ($y - $cy)) -gt $srcR - $margin) { $src.SetPixel($x, $y, $navy) }
    } }
  }
}

# 1. Иконки приложения «any»: весь знак, углы прозрачные
foreach ($s in 192, 512) {
  $bmp, $g = New-Canvas $s $s
  Draw-Rounded $g $src (New-Object System.Drawing.RectangleF 0, 0, $s, $s) ($s * $radiusShare) $full
  $g.Dispose(); Save $bmp "$public/icons/icon-$s.png"
}

# 2. maskable (Android сам обрезает форму): сплошной фон, знак в безопасной зоне 80 %
# 3. apple-touch-icon: iOS сам скругляет углы, прозрачность не допускается
foreach ($spec in @(@{ s = 512; k = 0.80; out = "$public/icons/icon-maskable-512.png" }, @{ s = 180; k = 0.92; out = "$public/apple-touch-icon.png" })) {
  $s = $spec.s; $bmp, $g = New-Canvas $s $s
  $g.Clear($navy)
  $inner = $s * $spec.k; $off = ($s - $inner) / 2
  Draw-Rounded $g $src (New-Object System.Drawing.RectangleF $off, $off, $inner, $inner) ($inner * $radiusShare) $full
  $g.Dispose(); Save $bmp $spec.out
}

# 4. Знак для фавиконки и шапки: центральный корпус здания (надпись на 16–32 px не читается)
$mark = New-Object System.Drawing.Rectangle 300, 330, 655, 400
function New-Mark([int]$s) {
  $bmp, $g = New-Canvas $s $s
  $g.FillPath((New-Object System.Drawing.SolidBrush $navy), (Get-RoundedPath 0 0 $s $s ($s * 0.22)))
  $w = $s * 0.86; $h = $w * $mark.Height / $mark.Width
  $g.DrawImage($src, (New-Object System.Drawing.RectangleF (($s - $w) / 2), (($s - $h) / 2 + $s * 0.02), $w, $h), $mark, 'Pixel')
  $g.Dispose(); return $bmp
}
foreach ($s in 32, 48, 64, 128) { Save (New-Mark $s) "$public/brand/mark-$s.png" }
# 16 px: уменьшенный корпус сливается в пятно, поэтому рисуем по пикселям — карниз, три панели, цоколь, вход
$bmp, $g = New-Canvas 16 16
$g.FillPath((New-Object System.Drawing.SolidBrush $navy), (Get-RoundedPath 0 0 16 16 3.5))
$g.SmoothingMode = 'None'; $g.PixelOffsetMode = 'Half'
foreach ($r in @(@(2, 2, 12, 1), @(2, 4, 3, 5), @(6, 4, 4, 5), @(11, 4, 3, 5), @(2, 10, 12, 1), @(6, 12, 4, 2))) {
  $g.FillRectangle([System.Drawing.Brushes]::White, $r[0], $r[1], $r[2], $r[3])
}
$g.Dispose(); Save $bmp "$public/brand/mark-16.png"
Copy-Item "$public/brand/mark-32.png" "$public/favicon-32.png" -Force

# 5. favicon.ico: PNG 16, 32, 48 в одном контейнере ICO
$sizes = 16, 32, 48
$pngs = $sizes | ForEach-Object { , [System.IO.File]::ReadAllBytes("$public/brand/mark-$_.png") }
$ms = New-Object System.IO.MemoryStream; $bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $bw.Write([byte]$sizes[$i]); $bw.Write([byte]$sizes[$i]); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
[System.IO.File]::WriteAllBytes("$public/favicon.ico", $ms.ToArray()); $bw.Dispose()
foreach ($s in 16, 48) { Remove-Item "$public/brand/mark-$s.png" }

# 6. Силуэт здания для фона: белые линии → непрозрачные, синий фон → прозрачный (используется как CSS mask)
$bld = New-Object System.Drawing.Rectangle 40, 340, 1175, 390
$out = New-Object System.Drawing.Bitmap $bld.Width, $bld.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $bld.Height; $y++) {
  for ($x = 0; $x -lt $bld.Width; $x++) {
    $p = $src.GetPixel($bld.X + $x, $bld.Y + $y)
    $lum = ($p.R + $p.G + $p.B) / 3
    $a = [math]::Max(0, [math]::Min(255, [int](($lum - 60) * 255 / 170)))
    $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, 255, 255, 255))
  }
}
Save $out "$public/brand/building-outline.png"
$src.Dispose()
Write-Output 'готово'
