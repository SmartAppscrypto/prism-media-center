from pathlib import Path
import re, html
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
root=Path(__file__).resolve().parents[1]
out=root/'output/pdf/PRISM-Getting-Started.pdf'
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='PrismBody',fontName='Helvetica',fontSize=10,leading=15,spaceAfter=8,textColor=colors.HexColor('#263545')))
styles.add(ParagraphStyle(name='PrismTitle',fontName='Helvetica-Bold',fontSize=30,leading=35,spaceAfter=18,textColor=colors.HexColor('#112439')))
styles.add(ParagraphStyle(name='PrismH2',fontName='Helvetica-Bold',fontSize=18,leading=23,spaceBefore=18,spaceAfter=10,textColor=colors.HexColor('#126f7b'),keepWithNext=True))
styles.add(ParagraphStyle(name='PrismH3',fontName='Helvetica-Bold',fontSize=12,leading=17,spaceBefore=12,spaceAfter=8,textColor=colors.HexColor('#112439'),keepWithNext=True))
styles.add(ParagraphStyle(name='Cell',fontName='Helvetica',fontSize=8.5,leading=12,textColor=colors.HexColor('#263545')))
def fmt(s):
 s=html.escape(s).replace('↑','').replace('↻','').replace('⛶','')
 s=re.sub(r'\[([^]]+)\]\(([^)]+)\)',lambda m: '<link href="'+m[2]+'" color="#126f7b">'+m[1]+'</link>' if m[2].startswith('http') else m[1],s)
 s=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
 s=re.sub(r'`(.*?)`',r'<font name="Courier" size="8">\1</font>',s)
 return s
flow=[Paragraph('P R I S M   /   FIELD GUIDE',styles['PrismH3'])]
lines=(root/'docs/GETTING-STARTED.md').read_text().splitlines();i=0
while i<len(lines):
 line=lines[i];i+=1
 if not line.strip():continue
 if line.startswith('|'):
  rows=[line]
  while i<len(lines) and lines[i].startswith('|'):rows.append(lines[i]);i+=1
  cells=[[Paragraph(fmt(c.strip()),styles['Cell']) for c in r.strip('|').split('|')] for r in rows if not re.match(r'^\|\s*-',r)]
  t=Table(cells,colWidths=[160,340],repeatRows=1,hAlign='LEFT')
  t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dceff1')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f3f6f8'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
  flow.extend([t,Spacer(1,12)]);continue
 if line.startswith('## Make it') or line.startswith('## Keep it') or line.startswith('## Troubleshooting'):flow.append(PageBreak())
 if line.startswith('# '):style='PrismTitle';line=line[2:]
 elif line.startswith('## '):style='PrismH2';line=line[3:]
 elif line.startswith('### '):style='PrismH3';line=line[4:]
 else:style='PrismBody'
 if line.startswith('- '):line='• '+line[2:]
 flow.append(Paragraph(fmt(line),styles[style]))
def page(c,doc):
 c.setFillColor(colors.HexColor('#126f7b'));c.rect(0,776,612,16,fill=1,stroke=0)
 c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#667887'))
 c.drawString(56,32,'PRISM 0.15  /  DESKTOP PREVIEW  /  SEPTEMBER 2026')
 c.drawRightString(556,32,str(doc.page))
SimpleDocTemplate(str(out),pagesize=(612,792),leftMargin=56,rightMargin=56,topMargin=42,bottomMargin=55,title='PRISM - Getting Started',author='PRISM').build(flow,onFirstPage=page,onLaterPages=page)
print(out)
