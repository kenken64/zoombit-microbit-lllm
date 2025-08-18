#!/usr/bin/env python3
"""
PDF to PNG Converter Script
Converts ZOOMBIT.pdf into PNG images and saves them to the documents folder.
"""

import os
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF not found. Installing...")
    os.system("pip install PyMuPDF")
    import fitz

def create_documents_folder():
    """Create documents folder if it doesn't exist."""
    docs_folder = Path("documents")
    docs_folder.mkdir(exist_ok=True)
    return docs_folder

def convert_pdf_to_png(pdf_path, output_folder):
    """
    Convert PDF pages to PNG images.
    
    Args:
        pdf_path (str): Path to the PDF file
        output_folder (Path): Folder to save PNG images
    """
    try:
        # Open the PDF file
        pdf_document = fitz.open(pdf_path)
        
        print(f"Converting {pdf_path} to PNG images...")
        print(f"Total pages: {len(pdf_document)}")
        
        # Convert each page to PNG
        for page_num in range(len(pdf_document)):
            page = pdf_document.load_page(page_num)
            
            # Create a transformation matrix for higher resolution
            mat = fitz.Matrix(2, 2)  # 2x zoom for better quality
            pix = page.get_pixmap(matrix=mat)
            
            # Generate output filename
            output_filename = output_folder / f"ZOOMBIT_page_{page_num + 1:03d}.png"
            
            # Save the image
            pix.save(output_filename)
            print(f"Saved: {output_filename}")
        
        pdf_document.close()
        print(f"\nConversion complete! {len(pdf_document)} pages converted.")
        
    except Exception as e:
        print(f"Error converting PDF: {e}")
        sys.exit(1)

def main():
    """Main function to execute the conversion."""
    pdf_file = "ZOOMBIT.pdf"
    
    # Check if PDF file exists
    if not os.path.exists(pdf_file):
        print(f"Error: {pdf_file} not found in current directory.")
        sys.exit(1)
    
    # Create documents folder
    output_folder = create_documents_folder()
    print(f"Output folder: {output_folder.absolute()}")
    
    # Convert PDF to PNG
    convert_pdf_to_png(pdf_file, output_folder)

if __name__ == "__main__":
    main()