"""
Groq AI Service for Guidely application.

This module provides AI-powered description generation using Groq's LLM API
for creating multilingual step descriptions.
"""

import json
from typing import Tuple, Optional
from groq import Groq

from app.core.config import settings


class GroqService:
    """
    Service class for handling Groq AI operations.
    
    This service generates multilingual descriptions for user actions
    using Groq's language models.
    """
    
    def __init__(self):
        """
        Initialize Groq client with API key from settings.
        
        Raises:
            ValueError: If GROQ_API_KEY is not configured
        """
        if not settings.GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY not configured. Please set GROQ_API_KEY in environment variables."
            )
        
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = "llama-3.3-70b-versatile"
    
    def generate_description(
        self, 
        action: Optional[str], 
        element: Optional[str]
    ) -> Tuple[str, str]:
        """
        Generate English and Arabic descriptions for a user action.
        
        This method sends a prompt to Groq's LLM to generate contextual
        descriptions of user actions in both English and Arabic languages.
        
        Args:
            action: Type of action performed (e.g., "click", "scroll", "type")
            element: Target element or component (e.g., "button", "input field")
        
        Returns:
            Tuple[str, str]: (description_en, description_ar)
        
        Raises:
            Exception: If description generation fails
        """
        try:
            # Construct the prompt for Groq
            prompt = f"""You are a product guide assistant.
Generate a short description for this user action:

Action: {action or 'unknown'}
Element: {element or 'unknown'}

Respond in JSON format only:
{{'description_en': 'English description here', 'description_ar': 'Arabic description here'}}"""
            
            # Call Groq API
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful assistant that generates concise, clear product guide descriptions in multiple languages. Always respond with valid JSON only."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                model=self.model,
                temperature=0.7,
                max_tokens=500,
                response_format={"type": "json_object"}  # Ensure JSON response
            )
            
            # Extract response content
            response_content = chat_completion.choices[0].message.content
            
            # Parse JSON response
            response_data = json.loads(response_content)
            
            # Extract descriptions
            description_en = response_data.get('description_en', '')
            description_ar = response_data.get('description_ar', '')
            
            # Validate that descriptions are not empty
            if not description_en or not description_ar:
                raise ValueError("Generated descriptions are empty")
            
            return (description_en, description_ar)
        
        except json.JSONDecodeError as e:
            raise Exception(f"Failed to parse Groq response as JSON: {str(e)}")
        
        except Exception as e:
            raise Exception(f"Failed to generate descriptions: {str(e)}")


# Create a single instance of GroqService to be imported throughout the application
groq_service = GroqService()
