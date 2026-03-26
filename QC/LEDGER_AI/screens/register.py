# import streamlit as st
# from db.connection import get_connection
# import hashlib
 
# def hash_password(password):
#     return hashlib.sha256(password.encode()).hexdigest()
 
# def show_register():
#     st.title("Register")
 
#     email = st.text_input("Email")
#     password = st.text_input("Password", type="password")
 
#     if st.button("Create Account"):
 
#         conn = get_connection()
#         cursor = conn.cursor()
 
#         cursor.execute("""
#             INSERT INTO users (email, password_hash)
#             VALUES (%s, %s)
#         """, (email, hash_password(password)))
 
#         conn.commit()
#         cursor.close()
#         conn.close()
 
#         st.success("Account Created")
#         st.session_state.screen = "login"
#         st.rerun()
 