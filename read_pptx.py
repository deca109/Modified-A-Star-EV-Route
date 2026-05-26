import zipfile
import xml.etree.ElementTree as ET
import sys
import re

def extract_text_from_pptx(pptx_path):
    namespaces = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                  'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
    text_content = []
    
    try:
        with zipfile.ZipFile(pptx_path, 'r') as pptx:
            slide_files = [f for f in pptx.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
            slide_files.sort(key=lambda x: int(re.search(r'slide(\d+)\.xml', x).group(1)))
            
            for slide_file in slide_files:
                slide_xml = pptx.read(slide_file)
                tree = ET.fromstring(slide_xml)
                
                slide_text = []
                for node in tree.findall('.//a:t', namespaces):
                    if node.text:
                        slide_text.append(node.text)
                
                if slide_text:
                    text_content.append(f"--- Slide {re.search(r'slide(\d+)\.xml', slide_file).group(1)} ---\n" + "\n".join(slide_text))
                    
    except Exception as e:
        print(f"Error: {e}")
        
    return "\n\n".join(text_content)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        text = extract_text_from_pptx(sys.argv[1])
        with open('pptx_output.txt', 'w', encoding='utf-8') as f:
            f.write(text)
