Add-Type -AssemblyName System.Drawing
$sv=Join-Path $PSScriptRoot '..\..\..\..\..\assets\art\player\sv01\sv01_bank_02_desc_59p2.png'
$dart=Join-Path $PSScriptRoot '..\..\dart-representative\dart-idle.png'
foreach($mode in @('day','night','silhouette')){
 $b=New-Object System.Drawing.Bitmap 1280,720;$g=[System.Drawing.Graphics]::FromImage($b)
 $bg=switch($mode){'day'{[System.Drawing.Color]::FromArgb(148,184,202)}'night'{[System.Drawing.Color]::FromArgb(13,20,35)}'silhouette'{[System.Drawing.Color]::White}};$g.Clear($bg)
 $items=@(@('Mantis 두 독립 총',96,(Join-Path $PSScriptRoot 'mantis\mantis-idle.png')),@('Needle 짧은 코일총',112,(Join-Path $PSScriptRoot 'needle\needle-idle.png')),@('Dart 긴 레일총',96,$dart),@('SV01',106,$sv))
 $i=0;foreach($item in $items){$img=New-Object System.Drawing.Bitmap $item[2];$w=[int]$item[1];if($mode -eq 'silhouette'){for($y=0;$y -lt $img.Height;$y++){for($x=0;$x -lt $img.Width;$x++){$p=$img.GetPixel($x,$y);$img.SetPixel($x,$y,[System.Drawing.Color]::FromArgb($p.A,0,0,0))}}};$cx=220+$i*270;$g.DrawImage($img,[int]($cx-$w/2),[int](360-$w/2),$w,$w);$g.DrawString("$($item[0]) $w",(New-Object System.Drawing.Font 'Malgun Gothic',13),[System.Drawing.Brushes]::Gray,$cx-95,460);$img.Dispose();$i++}
 $g.DrawString("일반형 대표 idle | 실제 표시96/112 · SV106 · 합성 제어 배경 $mode",(New-Object System.Drawing.Font 'Malgun Gothic',16),[System.Drawing.Brushes]::Gray,20,20)
 $b.Save((Join-Path $PSScriptRoot "roles-$mode.png"),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$b.Dispose()
}
